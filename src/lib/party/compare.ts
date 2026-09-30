import type { CatalogGrade, CatalogItem } from "./catalog";
import { hasCatalog, type SlotDefinition } from "./slots";
import type { PartyMember } from "./snapshot";

export const WEAK_GRADE_THRESHOLD = "Unique";
export const ENCHANT_GAP = 5;

export type CompareCell =
  | { kind: "empty" }
  | { kind: "item"; itemId: number; item: CatalogItem | null; enchantLevel: number; exceedLevel: number; weakness: Weakness | null };

export type Weakness = { kind: "grade" } | { kind: "enchant"; belowAverage: number };

export interface CompareRow {
  slot: SlotDefinition;
  cells: CompareCell[];
  gaps: number;
}

function gradeRanks(grades: readonly CatalogGrade[]): { rankOf: (gradeId: string) => number | null; threshold: number | null } {
  const ranks = new Map(grades.map((grade) => [grade.id, grade.rank]));
  return { rankOf: (gradeId) => ranks.get(gradeId) ?? null, threshold: ranks.get(WEAK_GRADE_THRESHOLD) ?? null };
}

function weaknessOf(
  item: CatalogItem | null,
  enchantLevel: number,
  average: number | null,
  ranks: ReturnType<typeof gradeRanks>,
): Weakness | null {
  const rank = item ? ranks.rankOf(item.gradeId) : null;
  if (rank !== null && ranks.threshold !== null && rank < ranks.threshold) return { kind: "grade" };
  if (average !== null && enchantLevel <= average - ENCHANT_GAP) {
    return { kind: "enchant", belowAverage: Math.round(average - enchantLevel) };
  }
  return null;
}

export function compareRows(
  members: readonly PartyMember[],
  slots: readonly SlotDefinition[],
  items: ReadonlyMap<number, CatalogItem>,
  grades: readonly CatalogGrade[],
): CompareRow[] {
  const ranks = gradeRanks(grades);

  return slots.filter(hasCatalog).map((slot) => {
    const equipped = members.map((member) => member.equipment.find((entry) => entry.slotPos === slot.slotPos) ?? null);
    const filled = equipped.filter((entry) => entry !== null);
    const average = filled.length > 1 ? filled.reduce((sum, entry) => sum + entry.enchantLevel, 0) / filled.length : null;

    const cells = equipped.map<CompareCell>((entry) => {
      if (!entry) return { kind: "empty" };
      const item = items.get(entry.itemId) ?? null;
      return {
        kind: "item",
        itemId: entry.itemId,
        item,
        enchantLevel: entry.enchantLevel,
        exceedLevel: entry.exceedLevel,
        weakness: weaknessOf(item, entry.enchantLevel, average, ranks),
      };
    });
    const gaps = cells.filter((cell) => cell.kind === "empty" || cell.weakness !== null).length;
    return { slot, cells, gaps };
  });
}
