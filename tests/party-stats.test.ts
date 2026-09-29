import { describe, expect, it } from "vitest";
import type { CatalogSkill } from "../src/lib/party/catalog";
import { defineSlots } from "../src/lib/party/slots";
import type { PartyMember } from "../src/lib/party/snapshot";
import { composition, memberStats, missingRoles, moveInList } from "../src/lib/party/stats";

const slots = defineSlots([
  { slotPos: 1, slotPosName: "MainHand" },
  { slotPos: 2, slotPosName: "SubHand" },
  { slotPos: 3, slotPosName: "Helmet" },
  { slotPos: 41, slotPosName: "Arcana1" },
]);

const skill = (id: number, category: CatalogSkill["category"] = "Active"): CatalogSkill => ({
  id,
  classId: 2,
  name: `Skill ${id}`,
  category,
  iconPath: "x.png",
  requiredLevel: 1,
  pointCostPerLevel: null,
});

const member = (overrides: Partial<PartyMember> = {}): PartyMember => ({
  id: "m",
  name: "Kaelen",
  classId: 2,
  role: "Tank",
  equipment: [],
  skills: [],
  ...overrides,
});

describe("memberStats", () => {
  it("counts only slots that have a catalog, and ignores gear in the others", () => {
    const stats = memberStats(
      member({
        equipment: [
          { slotPos: 1, itemId: 1, enchantLevel: 20, exceedLevel: 5, acquired: true },
          { slotPos: 3, itemId: 2, enchantLevel: 10, exceedLevel: 0, acquired: false },
          { slotPos: 41, itemId: 3, enchantLevel: 0, exceedLevel: 0, acquired: true },
        ],
      }),
      slots,
      [],
    );

    expect(stats).toMatchObject({
      slotsTotal: 4,
      slotsFilled: 2,
      slotsAcquired: 1,
      slotsPlanned: 1,
      slotsMissing: 2,
      averageEnchant: 15,
    });
  });

  it("reports no average enchant when nothing is equipped", () => {
    expect(memberStats(member(), slots, []).averageEnchant).toBeNull();
  });

  it("counts planned and equipped skills of the member's class only", () => {
    const stats = memberStats(
      member({
        skills: [
          { skillId: 1, level: 10, equipped: true },
          { skillId: 2, level: 5, equipped: false },
          { skillId: 99, level: 30, equipped: true },
        ],
      }),
      slots,
      [skill(1), skill(2, "Passive"), skill(3)],
    );

    expect(stats).toMatchObject({ skillsTotal: 3, skillsPlanned: 2, skillsEquipped: 1, plannedLevels: 15 });
  });
});

describe("composition", () => {
  it("counts each role and names the missing ones", () => {
    const counts = composition([{ role: "Tank" }, { role: "DPS" }, { role: "DPS" }]);
    expect(counts).toEqual({ Tank: 1, Healer: 0, DPS: 2, Support: 0 });
    expect(missingRoles(counts)).toEqual(["Healer", "Support"]);
  });
});

describe("moveInList", () => {
  it.each([
    [0, 2, ["b", "c", "a", "d"]],
    [3, 0, ["d", "a", "b", "c"]],
    [1, 9, ["a", "c", "d", "b"]],
    [2, -3, ["c", "a", "b", "d"]],
  ])("moves index %i to %i", (from, to, expected) => {
    expect(moveInList(["a", "b", "c", "d"], from, to)).toEqual(expected);
  });
});
