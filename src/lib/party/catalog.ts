import { and, asc, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { activeRunId, type AnyDatabase } from "../catalog/runs";
import { classes, equipmentSlots, itemGrades, items, skills } from "../db/schema";
import { defineSlots, sortSlots, type SlotDefinition } from "./slots";

export interface CatalogClass {
  id: number;
  name: string;
  displayName: string;
}

export interface CatalogGrade {
  id: string;
  name: string;
  rank: number;
}

export interface CatalogSkill {
  id: number;
  classId: number;
  name: string;
  category: "Active" | "Passive" | "Dp";
  iconPath: string;
  requiredLevel: number;
  pointCostPerLevel: number | null;
}

export interface CatalogItem {
  id: number;
  name: string;
  iconPath: string;
  gradeId: string;
  categoryName: string;
  options: string[];
}

export interface PartyCatalog {
  classes: CatalogClass[];
  grades: CatalogGrade[];
  slots: SlotDefinition[];
  skills: CatalogSkill[];
  itemCount: number;
  missing: ("classes" | "items" | "character_sample")[];
}

export async function loadPartyCatalog(db: AnyDatabase): Promise<PartyCatalog> {
  const [classRun, itemRun, sampleRun] = await Promise.all([
    activeRunId(db, "classes"),
    activeRunId(db, "items"),
    activeRunId(db, "character_sample"),
  ]);

  const [classRows, gradeRows, slotRows, skillRows, [{ itemCount }]] = await Promise.all([
    classRun === null
      ? []
      : db
          .select({ id: classes.id, name: classes.name, displayName: classes.displayName })
          .from(classes)
          .where(eq(classes.runId, classRun))
          .orderBy(asc(classes.id)),
    itemRun === null
      ? []
      : db
          .select({ id: itemGrades.id, name: itemGrades.name, rank: itemGrades.rank })
          .from(itemGrades)
          .where(eq(itemGrades.runId, itemRun))
          .orderBy(asc(itemGrades.rank)),
    sampleRun === null
      ? []
      : db
          .select({ slotPos: equipmentSlots.slotPos, slotPosName: equipmentSlots.slotPosName })
          .from(equipmentSlots)
          .where(eq(equipmentSlots.runId, sampleRun)),
    sampleRun === null
      ? []
      : db
          .select({
            id: skills.id,
            classId: skills.classId,
            name: skills.name,
            category: skills.category,
            iconPath: skills.iconPath,
            requiredLevel: skills.requiredLevel,
            pointCostPerLevel: skills.pointCostPerLevel,
          })
          .from(skills)
          .where(eq(skills.runId, sampleRun))
          .orderBy(asc(skills.requiredLevel), asc(skills.id)),
    itemRun === null
      ? [{ itemCount: 0 }]
      : db.select({ itemCount: sql<number>`count(*)::int` }).from(items).where(eq(items.runId, itemRun)),
  ]);

  const missing = (
    [
      ["classes", classRun],
      ["items", itemRun],
      ["character_sample", sampleRun],
    ] as const
  )
    .filter(([, run]) => run === null)
    .map(([kind]) => kind);

  return {
    classes: classRows,
    grades: gradeRows,
    slots: sortSlots(defineSlots(slotRows)),
    skills: skillRows,
    itemCount,
    missing,
  };
}

export async function findSlot(db: AnyDatabase, slotPos: number): Promise<SlotDefinition | null> {
  const run = await activeRunId(db, "character_sample");
  if (run === null) return null;
  const observed = await db
    .select({ slotPos: equipmentSlots.slotPos, slotPosName: equipmentSlots.slotPosName })
    .from(equipmentSlots)
    .where(eq(equipmentSlots.runId, run));
  return defineSlots(observed).find((slot) => slot.slotPos === slotPos) ?? null;
}

const itemColumns = {
  id: items.id,
  name: items.name,
  iconPath: items.iconPath,
  gradeId: items.gradeId,
  categoryName: items.categoryName,
  options: items.options,
};

export async function loadItems(db: AnyDatabase, ids: readonly number[]): Promise<CatalogItem[]> {
  if (ids.length === 0) return [];
  const run = await activeRunId(db, "items");
  if (run === null) return [];
  return db
    .select(itemColumns)
    .from(items)
    .where(and(eq(items.runId, run), inArray(items.id, [...new Set(ids)])));
}

export interface ItemSearch {
  categories: readonly string[];
  query: string;
  gradeIds: readonly string[];
  limit: number;
}

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (match) => `\\${match}`);

export async function searchItems(db: AnyDatabase, search: ItemSearch): Promise<CatalogItem[]> {
  const run = await activeRunId(db, "items");
  if (run === null || search.categories.length === 0) return [];

  const conditions = [eq(items.runId, run), inArray(items.categoryName, [...search.categories])];
  const query = search.query.trim();
  if (query) conditions.push(ilike(items.name, `%${escapeLike(query)}%`));
  if (search.gradeIds.length > 0) conditions.push(inArray(items.gradeId, [...search.gradeIds]));

  return db
    .select(itemColumns)
    .from(items)
    .innerJoin(itemGrades, and(eq(itemGrades.runId, items.runId), eq(itemGrades.id, items.gradeId)))
    .where(and(...conditions))
    .orderBy(desc(itemGrades.rank), asc(items.name), asc(items.id))
    .limit(search.limit);
}
