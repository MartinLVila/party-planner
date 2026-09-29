import { count, eq } from "drizzle-orm";
import { equipmentSlots, skills, type SkillCategory } from "../db/schema";
import { SITE_API, type FetchJson } from "../upstream/client";
import {
  characterEquipmentSchema,
  characterSearchSchema,
  classListSchema,
  pcDataSchema,
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

export function decodeCharacterId(characterId: string): string {
  if (!characterId.includes("%")) return characterId;
  try {
    return decodeURIComponent(characterId);
  } catch {
    throw new CatalogRejected(`character id is not valid URL encoding: ${characterId}`);
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
    const key = `${result.serverId}:${decodeCharacterId(result.characterId)}`;
    if (!unique.has(key)) unique.set(key, result);
  }
  return [...unique.values()].sort((a, b) => b.level - a.level).slice(0, limit);
}

export async function fetchCharacterSample(fetchJson: FetchJson): Promise<CharacterSample> {
  const sampledClasses = await loadClasses(fetchJson);
  const skillsById = new Map<number, SampledSkill>();
  const slotsByPos = new Map<number, string>();
  const perClass: Record<string, { characters: number; skills: number; highestLevel: number }> = {};

  for (const sampledClass of sampledClasses) {
    let characters = 0;
    let highestLevel = 0;
    const classSkills = new Set<number>();

    for (const race of RACES) {
      const pcIds = sampledClass.pcIdsByRace.get(race) ?? [];
      const { list } = await fetchJson(
        siteUrl("/search/character", {
          keyword: SEARCH_KEYWORD,
          race,
          pcId: pcIds.join(","),
          page: 1,
          size: SEARCH_PAGE_SIZE,
        }),
        characterSearchSchema,
      );

      for (const character of highestLevelCharacters(list, pcIds, CHARACTERS_PER_CLASS_AND_RACE)) {
        const equipment = await fetchJson(
          siteUrl("/character/equipment", {
            serverId: character.serverId,
            characterId: decodeCharacterId(character.characterId),
          }),
          characterEquipmentSchema,
        );
        characters += 1;
        highestLevel = Math.max(highestLevel, character.level);

        for (const slot of equipment.equipment.equipmentList) {
          const known = slotsByPos.get(slot.slotPos);
          if (known !== undefined && known !== slot.slotPosName) {
            throw new CatalogRejected(`slot ${slot.slotPos} is both ${known} and ${slot.slotPosName}`);
          }
          slotsByPos.set(slot.slotPos, slot.slotPosName);
        }

        for (const skill of equipment.skill.skillList) {
          const known = skillsById.get(skill.id);
          if (known && (known.classId !== sampledClass.id || known.name !== skill.name || known.category !== skill.category)) {
            throw new CatalogRejected(
              `skill ${skill.id} disagrees between samples: ${known.name} (${known.category}, class ${known.classId}) and ${skill.name} (${skill.category}, class ${sampledClass.id})`,
            );
          }
          const learnedLevel = skill.acquired === 1 ? skill.skillLevel : 0;
          skillsById.set(skill.id, {
            id: skill.id,
            classId: sampledClass.id,
            name: skill.name,
            category: skill.category,
            iconPath: skill.icon,
            requiredLevel: skill.needLevel,
            maxLevelSeen: Math.max(known?.maxLevelSeen ?? 0, learnedLevel),
          });
          classSkills.add(skill.id);
        }
      }
    }

    if (characters < MINIMUM_CHARACTERS_PER_CLASS) {
      throw new CatalogRejected(
        `${sampledClass.name}: sampled ${characters} characters, need at least ${MINIMUM_CHARACTERS_PER_CLASS}`,
      );
    }
    if (classSkills.size === 0) throw new CatalogRejected(`${sampledClass.name}: sampled characters list no skills`);
    perClass[sampledClass.name] = { characters, skills: classSkills.size, highestLevel };
  }

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
