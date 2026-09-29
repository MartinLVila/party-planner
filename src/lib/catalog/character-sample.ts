import { count, eq } from "drizzle-orm";
import { equipmentSlots, skills, type SkillCategory } from "../db/schema";
import { SITE_API, type FetchJson } from "../upstream/client";
import {
  characterEquipmentSchema,
  characterSearchSchema,
  classListSchema,
  pcDataSchema,
  type CharacterEquipment,
  type CharacterSearchResult,
} from "../upstream/schemas";
import { classesSource } from "./classes";
import {
  activateRun,
  activeRunId,
  assertNotShrunk,
  CatalogRejected,
  chunk,
  failRun,
  lockCatalog,
  startRun,
  type AnyDatabase,
  type Examined,
} from "./runs";

export const RACES = [1, 2] as const;
export const SEARCH_KEYWORD = "a";
export const SEARCH_PAGE_SIZE = 200;
export const CHARACTERS_PER_CLASS_AND_RACE = 3;
export const MINIMUM_CHARACTERS_PER_CLASS = 2;
const INSERT_BATCH_SIZE = 500;

export interface SampledSkill {
  id: number;
  classId: number;
  name: string;
  category: SkillCategory;
  iconPath: string;
  requiredLevel: number;
  maxLevelSeen: number;
}

export interface CharacterSample {
  skills: SampledSkill[];
  slots: { slotPos: number; slotPosName: string }[];
  examined: Examined;
}

interface SampledClass {
  id: number;
  name: string;
  pcIdsByRace: Map<number, number[]>;
}

const RACE_BY_NAME: Record<string, number> = { light: 1, dark: 2 };

const siteUrl = (path: string, params: Record<string, string | number>) => {
  const url = new URL(`${SITE_API}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  url.searchParams.set("lang", "en");
  return url.toString();
};

export function characterSampleSource(): string {
  return `${SITE_API}/search/character + ${SITE_API}/character/equipment`;
}

export function decodeCharacterId(characterId: string): string | null {
  if (!characterId.includes("%")) return characterId;
  try {
    return decodeURIComponent(characterId);
  } catch {
    return null;
  }
}

async function loadClasses(fetchJson: FetchJson): Promise<SampledClass[]> {
  const { classList } = await fetchJson(classesSource(), classListSchema);
  const { pcDataList } = await fetchJson(siteUrl("/gameinfo/pcdata", {}), pcDataSchema);

  return classList.map((entry) => {
    const pcIdsByRace = new Map<number, number[]>();
    for (const pc of pcDataList) {
      if (pc.className.toLowerCase() !== entry.name.toLowerCase()) continue;
      const race = RACE_BY_NAME[pc.raceName.toLowerCase()];
      if (race === undefined) throw new CatalogRejected(`pcId ${pc.id} has unknown race ${pc.raceName}`);
      pcIdsByRace.set(race, [...(pcIdsByRace.get(race) ?? []), pc.id]);
    }
    for (const race of RACES) {
      if (!pcIdsByRace.get(race)?.length) {
        throw new CatalogRejected(`class ${entry.name} has no pcId for race ${race}`);
      }
    }
    return { id: entry.id, name: entry.text, pcIdsByRace };
  });
}

export function highestLevelCharacters(
  results: CharacterSearchResult[],
  allowedPcIds: number[],
  limit: number,
): CharacterSearchResult[] {
  const allowed = new Set(allowedPcIds);
  const unique = new Map<string, CharacterSearchResult>();
  for (const result of results) {
    if (!allowed.has(result.pcId)) continue;
    const characterId = decodeCharacterId(result.characterId);
    if (characterId === null) continue;
    const key = `${result.serverId}:${characterId}`;
    if (!unique.has(key)) unique.set(key, { ...result, characterId });
  }
  return [...unique.values()].sort((a, b) => b.level - a.level).slice(0, limit);
}

interface SampleAccumulator {
  skillsById: Map<number, SampledSkill>;
  slotsByPos: Map<number, string>;
}

interface ClassTally {
  characters: number;
  highestLevel: number;
  skillIds: Set<number>;
}

function recordSlots(accumulator: SampleAccumulator, equipment: CharacterEquipment): void {
  for (const slot of equipment.equipment.equipmentList) {
    const known = accumulator.slotsByPos.get(slot.slotPos);
    if (known !== undefined && known !== slot.slotPosName) {
      throw new CatalogRejected(`slot ${slot.slotPos} is both ${known} and ${slot.slotPosName}`);
    }
    accumulator.slotsByPos.set(slot.slotPos, slot.slotPosName);
  }
}

type UpstreamSkill = CharacterEquipment["skill"]["skillList"][number];

function assertSameSkill(known: SampledSkill, skill: UpstreamSkill, classId: number): void {
  if (known.classId === classId && known.name === skill.name && known.category === skill.category) return;
  throw new CatalogRejected(
    `skill ${skill.id} disagrees between samples: ${known.name} (${known.category}, class ${known.classId}) ` +
      `and ${skill.name} (${skill.category}, class ${classId})`,
  );
}

function recordSkills(accumulator: SampleAccumulator, equipment: CharacterEquipment, classId: number): number[] {
  return equipment.skill.skillList.map((skill) => {
    const known = accumulator.skillsById.get(skill.id);
    if (known) assertSameSkill(known, skill, classId);
    const learnedLevel = skill.acquired === 1 ? skill.skillLevel : 0;
    accumulator.skillsById.set(skill.id, {
      id: skill.id,
      classId,
      name: skill.name,
      category: skill.category,
      iconPath: skill.icon,
      requiredLevel: skill.needLevel,
      maxLevelSeen: Math.max(known?.maxLevelSeen ?? 0, learnedLevel),
    });
    return skill.id;
  });
}

async function searchCandidates(fetchJson: FetchJson, pcIds: number[], race: number) {
  const { list } = await fetchJson(
    siteUrl("/search/character", { keyword: SEARCH_KEYWORD, race, pcId: pcIds.join(","), page: 1, size: SEARCH_PAGE_SIZE }),
    characterSearchSchema,
  );
  return highestLevelCharacters(list, pcIds, CHARACTERS_PER_CLASS_AND_RACE);
}

async function sampleClass(
  fetchJson: FetchJson,
  accumulator: SampleAccumulator,
  sampledClass: SampledClass,
): Promise<ClassTally> {
  const tally: ClassTally = { characters: 0, highestLevel: 0, skillIds: new Set() };

  for (const race of RACES) {
    const candidates = await searchCandidates(fetchJson, sampledClass.pcIdsByRace.get(race) ?? [], race);
    for (const character of candidates) {
      const equipment = await fetchJson(
        siteUrl("/character/equipment", { serverId: character.serverId, characterId: character.characterId }),
        characterEquipmentSchema,
      );
      tally.characters += 1;
      tally.highestLevel = Math.max(tally.highestLevel, character.level);
      recordSlots(accumulator, equipment);
      recordSkills(accumulator, equipment, sampledClass.id).forEach((id) => tally.skillIds.add(id));
    }
  }

  if (tally.characters < MINIMUM_CHARACTERS_PER_CLASS) {
    throw new CatalogRejected(
      `${sampledClass.name}: sampled ${tally.characters} characters, need at least ${MINIMUM_CHARACTERS_PER_CLASS}`,
    );
  }
  if (tally.skillIds.size === 0) throw new CatalogRejected(`${sampledClass.name}: sampled characters list no skills`);
  return tally;
}

export async function fetchCharacterSample(fetchJson: FetchJson): Promise<CharacterSample> {
  const sampledClasses = await loadClasses(fetchJson);
  const accumulator: SampleAccumulator = { skillsById: new Map(), slotsByPos: new Map() };
  const perClass: Record<string, { characters: number; skills: number; highestLevel: number }> = {};

  for (const sampledClass of sampledClasses) {
    const tally = await sampleClass(fetchJson, accumulator, sampledClass);
    perClass[sampledClass.name] = {
      characters: tally.characters,
      skills: tally.skillIds.size,
      highestLevel: tally.highestLevel,
    };
  }

  const { skillsById, slotsByPos } = accumulator;
  if (slotsByPos.size === 0) throw new CatalogRejected("sampled characters list no equipment slots");

  const sampledSkills = [...skillsById.values()];
  const slots = [...slotsByPos.entries()]
    .map(([slotPos, slotPosName]) => ({ slotPos, slotPosName }))
    .sort((a, b) => a.slotPos - b.slotPos);

  return {
    skills: sampledSkills,
    slots,
    examined: {
      classes: sampledClasses.length,
      characters: Object.values(perClass).reduce((total, entry) => total + entry.characters, 0),
      skills: sampledSkills.length,
      slots: slots.length,
      byClass: perClass,
    },
  };
}

export async function writeCharacterSample(db: AnyDatabase, runId: number, sample: CharacterSample): Promise<void> {
  await db.transaction(async (tx) => {
    await lockCatalog(tx, "character_sample");
    const previousRunId = await activeRunId(tx, "character_sample");
    if (previousRunId !== null) {
      const [{ value: activeSkills }] = await tx
        .select({ value: count() })
        .from(skills)
        .where(eq(skills.runId, previousRunId));
      assertNotShrunk("skills", sample.skills.length, activeSkills);
      const [{ value: activeSlots }] = await tx
        .select({ value: count() })
        .from(equipmentSlots)
        .where(eq(equipmentSlots.runId, previousRunId));
      assertNotShrunk("equipment slots", sample.slots.length, activeSlots);
    }

    for (const batch of chunk(sample.skills, INSERT_BATCH_SIZE)) {
      await tx.insert(skills).values(batch.map((skill) => ({ runId, ...skill })));
    }
    await tx.insert(equipmentSlots).values(sample.slots.map((slot) => ({ runId, ...slot })));

    await activateRun(tx, "character_sample", runId, sample.examined);
  });
}

export async function syncCharacterSample(db: AnyDatabase, fetchJson: FetchJson): Promise<CharacterSample> {
  const runId = await startRun(db, "character_sample", characterSampleSource());
  let examined: Examined = {};
  try {
    const sample = await fetchCharacterSample(fetchJson);
    examined = sample.examined;
    await writeCharacterSample(db, runId, sample);
    return sample;
  } catch (error) {
    await failRun(db, runId, error, examined);
    throw error;
  }
}
