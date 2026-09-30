import { describe, expect, it } from "vitest";
import type { CatalogGrade, CatalogItem } from "../src/lib/party/catalog";
import { compareRows } from "../src/lib/party/compare";
import { defineSlots } from "../src/lib/party/slots";
import type { MemberEquipment, PartyMember } from "../src/lib/party/snapshot";

const grades: CatalogGrade[] = [
  { id: "Common", name: "Common", rank: 0 },
  { id: "Rare", name: "Rare", rank: 1 },
  { id: "Legend", name: "Epic", rank: 2 },
  { id: "Unique", name: "Unique", rank: 3 },
  { id: "Epic", name: "Heroic", rank: 4 },
];

const item = (id: number, gradeId: string): CatalogItem => ({
  id,
  name: `Item ${id}`,
  iconPath: "x.png",
  gradeId,
  categoryName: "Greatsword",
  options: [],
});

const items = new Map([
  [1, item(1, "Epic")],
  [2, item(2, "Unique")],
  [3, item(3, "Legend")],
]);

const slots = defineSlots([
  { slotPos: 1, slotPosName: "MainHand" },
  { slotPos: 41, slotPosName: "Arcana1" },
]);

const gear = (itemId: number, enchantLevel: number): MemberEquipment => ({
  slotPos: 1,
  itemId,
  enchantLevel,
  exceedLevel: 0,
  acquired: true,
});

const member = (id: string, equipment: MemberEquipment[]): PartyMember => ({
  id,
  name: id,
  classId: 2,
  role: "DPS",
  equipment,
  skills: [],
});

describe("compareRows", () => {
  it("only compares slots that have a catalog", () => {
    const rows = compareRows([member("a", [])], slots, items, grades);
    expect(rows.map((row) => row.slot.slotPosName)).toEqual(["MainHand", "Wing"]);
  });

  it("flags empty slots, grades below Unique, and enchants 5 below the slot average", () => {
    const rows = compareRows(
      [
        member("a", [gear(1, 20)]),
        member("b", [gear(2, 20)]),
        member("c", [gear(3, 20)]),
        member("d", [gear(1, 5)]),
        member("e", []),
      ],
      slots,
      items,
      grades,
    );
    const mainHand = rows[0];

    expect(mainHand.cells.map((cell) => (cell.kind === "empty" ? "empty" : (cell.weakness?.kind ?? "ok")))).toEqual([
      "ok",
      "ok",
      "grade",
      "enchant",
      "empty",
    ]);
    expect(mainHand.cells[3]).toMatchObject({ weakness: { kind: "enchant", belowAverage: 11 } });
    expect(mainHand.gaps).toBe(3);
  });

  it("does not compare enchant levels when only one member has the slot filled", () => {
    const [mainHand] = compareRows([member("a", [gear(1, 0)]), member("b", [])], slots, items, grades);
    expect(mainHand.cells[0]).toMatchObject({ kind: "item", weakness: null });
  });

  it("does not flag the grade of an item missing from the catalog", () => {
    const [mainHand] = compareRows([member("a", [gear(99, 10)])], slots, items, grades);
    expect(mainHand.cells[0]).toMatchObject({ kind: "item", item: null, weakness: null });
  });
});
