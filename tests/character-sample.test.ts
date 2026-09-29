import { asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { highestLevelCharacters, syncCharacterSample } from "../src/lib/catalog/character-sample";
import { catalogState, equipmentSlots, skills, syncRuns } from "../src/lib/db/schema";
import { createTestDatabase, type TestDatabase } from "./helpers/database";
import { fakeUpstream, skill, stateWithCharacters } from "./helpers/fake-upstream";

let db: TestDatabase;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});

afterEach(async () => {
  await close();
});

const runs = () => db.select().from(syncRuns).orderBy(asc(syncRuns.id));
const activeRun = async () =>
  (await db.select().from(catalogState).where(eq(catalogState.kind, "character_sample")))[0]?.activeRunId ?? null;

describe("character sample", () => {
  it("builds each class's skill list from sampled characters", async () => {
    const upstream = fakeUpstream(stateWithCharacters());

    const sample = await syncCharacterSample(db, upstream.fetchJson);

    const templarSkills = await db.select().from(skills).where(eq(skills.classId, 3)).orderBy(asc(skills.id));
    expect(templarSkills.map((row) => [row.id, row.category, row.maxLevelSeen])).toEqual([
      [2001, "Active", 11],
      [2002, "Passive", 34],
      [2003, "Dp", 0],
    ]);
    expect(templarSkills.every((row) => row.pointCostPerLevel === null)).toBe(true);
    expect(await db.select().from(skills)).toHaveLength(24);

    const slots = await db.select().from(equipmentSlots).orderBy(asc(equipmentSlots.slotPos));
    expect(slots.map((slot) => slot.slotPosName)).toEqual(["MainHand", "SubHand"]);

    expect(sample.examined).toMatchObject({ classes: 8, characters: 32, skills: 24, slots: 2 });
    expect(sample.examined.byClass).toMatchObject({ Spiritmaster: { characters: 4, skills: 3, highestLevel: 50 } });
    const [run] = await runs();
    expect(run.status).toBe("succeeded");
    expect(await activeRun()).toBe(run.id);
  });

  it("sends character ids decoded once, not double-encoded", async () => {
    const upstream = fakeUpstream(stateWithCharacters());

    await syncCharacterSample(db, upstream.fetchJson);

    const equipmentUrls = upstream.urls.filter((url) => url.includes("/character/equipment"));
    expect(equipmentUrls).toHaveLength(32);
    expect(equipmentUrls.every((url) => new URL(url).searchParams.get("characterId")?.endsWith("="))).toBe(true);
  });

  describe("rejects the sample and keeps the active one when", () => {
    beforeEach(async () => {
      await syncCharacterSample(db, fakeUpstream(stateWithCharacters()).fetchJson);
    });

    async function expectFirstSampleUntouched(message: string) {
      const [first, latest] = await runs();
      expect(latest.status).toBe("failed");
      expect(latest.error).toContain(message);
      expect(await activeRun()).toBe(first.id);
      expect(await db.select().from(skills)).toHaveLength(24);
    }

    it("a class has too few sampled characters", async () => {
      const state = stateWithCharacters();
      const clericPcIds = new Set(state.pcData.filter((pc) => pc.className === "CLERIC").map((pc) => pc.id));
      state.characters = state.characters.filter(
        (character, index) => !clericPcIds.has(character.pcId) || index % 4 === 0,
      );
      const upstream = fakeUpstream(state);

      await expect(syncCharacterSample(db, upstream.fetchJson)).rejects.toThrow("Cleric: sampled 1 characters");
      await expectFirstSampleUntouched("need at least 2");
    });

    it("two characters disagree about a skill", async () => {
      const state = stateWithCharacters();
      state.characters[1].skills[0] = skill(1001, { name: "Renamed Strike" });
      const upstream = fakeUpstream(state);

      await expect(syncCharacterSample(db, upstream.fetchJson)).rejects.toThrow("skill 1001 disagrees between samples");
      await expectFirstSampleUntouched("Renamed Strike");
    });

    it("a skill shows up under two classes", async () => {
      const state = stateWithCharacters();
      const templar = state.characters.find((character) => character.characterId.startsWith("c1-"));
      templar?.skills.push(skill(1001));
      const upstream = fakeUpstream(state);

      await expect(syncCharacterSample(db, upstream.fetchJson)).rejects.toThrow("skill 1001 disagrees between samples");
      await expectFirstSampleUntouched("class 2");
    });

    it("two characters name the same slot differently", async () => {
      const state = stateWithCharacters();
      state.characters[2].slots = [{ slotPos: 1, slotPosName: "OffHand" }];
      const upstream = fakeUpstream(state);

      await expect(syncCharacterSample(db, upstream.fetchJson)).rejects.toThrow("slot 1 is both MainHand and OffHand");
      await expectFirstSampleUntouched("slot 1");
    });

    it("a class has no pcId for one race", async () => {
      const state = stateWithCharacters();
      state.pcData = state.pcData.filter((pc) => !(pc.className === "RANGER" && pc.raceName === "Dark"));
      const upstream = fakeUpstream(state);

      await expect(syncCharacterSample(db, upstream.fetchJson)).rejects.toThrow("class Ranger has no pcId for race 2");
      await expectFirstSampleUntouched("Ranger");
    });

    it("a skill icon is not on the game CDN", async () => {
      const state = stateWithCharacters();
      state.characters[0].skills[0] = skill(1001, { icon: "https://evil.example/icon.png" });
      const upstream = fakeUpstream(state);

      await expect(syncCharacterSample(db, upstream.fetchJson)).rejects.toThrow("failed validation");
      await expectFirstSampleUntouched("skill.skillList.0.icon");
    });
  });
});

describe("highestLevelCharacters", () => {
  const result = (characterId: string, level: number, pcId = 9, serverId = 1001) => ({
    characterId,
    level,
    pcId,
    serverId,
  });

  it("keeps the highest levels of the requested pcIds, once each", () => {
    const picked = highestLevelCharacters(
      [
        result("low%3D", 12),
        result("top%3D", 50),
        result("top=", 50),
        result("other-class", 50, 13),
        result("mid", 45),
        result("mid", 44, 9, 1002),
      ],
      [9],
      3,
    );

    expect(picked.map((character) => `${character.characterId}@${character.level}`)).toEqual([
      "top%3D@50",
      "mid@45",
      "mid@44",
    ]);
  });
});
