import { count, eq } from "drizzle-orm";
import { itemCategories, itemGrades, items } from "../db/schema";
import { DICTIONARY_API, type FetchJson } from "../upstream/client";
import {
  categoryListSchema,
  gradeListSchema,
  itemPageSchema,
  type ItemPage,
  type UpstreamItem,
} from "../upstream/schemas";
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

export interface ItemPartition {
  category1: string;
  category2?: string;
}

export const ITEM_PARTITIONS: readonly ItemPartition[] = [
  { category1: "Equip_Weapon" },
  { category1: "Equip_Armor" },
  { category1: "Equip_Accessory" },
  { category1: "Usable_001", category2: "Wing" },
];

export const ITEM_PAGE_SIZE = 500;
const INSERT_BATCH_SIZE = 500;

export interface ItemCatalog {
  grades: { id: string; name: string; rank: number }[];
  categories: { id: string; name: string; parentId: string | null }[];
  items: UpstreamItem[];
  examined: Examined;
}

const withLocale = (path: string, params: Record<string, string | number> = {}) => {
  const url = new URL(`${DICTIONARY_API}${path}`);
  url.searchParams.set("locale", "en-US");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  return url.toString();
};

export const partitionLabel = (partition: ItemPartition) =>
  partition.category2 ? `${partition.category1}/${partition.category2}` : partition.category1;

export function itemsSource(): string {
  return `${DICTIONARY_API}/dict/search/item`;
}

async function fetchGrades(fetchJson: FetchJson): Promise<ItemCatalog["grades"]> {
  const upstreamGrades = await fetchJson(withLocale("/game/item/grade"), gradeListSchema);
  const grades = upstreamGrades.map((grade, rank) => ({ id: grade.id, name: grade.name, rank }));
  if (new Set(grades.map((grade) => grade.id)).size !== grades.length) {
    throw new CatalogRejected("grade ids are not unique");
  }
  return grades;
}

async function fetchCategories(fetchJson: FetchJson): Promise<ItemCatalog["categories"]> {
  const upstreamCategories = await fetchJson(withLocale("/game/item/category"), categoryListSchema);
  const categories = upstreamCategories.flatMap((parent) => [
    { id: parent.id, name: parent.name, parentId: null },
    ...parent.child.map((child) => ({ id: child.id, name: child.name, parentId: parent.id })),
  ]);
  const categoryIds = new Set(categories.map((category) => category.id));
  if (categoryIds.size !== categories.length) throw new CatalogRejected("category ids are not unique");

  for (const partition of ITEM_PARTITIONS) {
    const missing = [partition.category1, partition.category2].filter(
      (id): id is string => id !== undefined && !categoryIds.has(id),
    );
    if (missing.length > 0) throw new CatalogRejected(`upstream no longer lists category ${missing.join(", ")}`);
  }
  return categories;
}

interface ItemCollector {
  gradeIds: ReadonlySet<string>;
  seen: Map<number, string>;
  items: UpstreamItem[];
  pages: number;
}

function assertConsistentPage(label: string, expectedTotal: number, pagination: ItemPage["pagination"]): void {
  const { total, limit } = pagination;
  if (total !== expectedTotal) {
    throw new CatalogRejected(`${label}: total changed from ${expectedTotal} to ${total} while paging`);
  }
  if (total > limit) throw new CatalogRejected(`${label}: ${total} items exceed the upstream paging limit ${limit}`);
}

function collectItems(collector: ItemCollector, label: string, pageItems: UpstreamItem[]): void {
  for (const item of pageItems) {
    const previous = collector.seen.get(item.id);
    if (previous !== undefined) {
      throw new CatalogRejected(`item ${item.id} appeared twice (${previous} and ${label})`);
    }
    if (!collector.gradeIds.has(item.grade)) {
      throw new CatalogRejected(`item ${item.id} has unknown grade ${item.grade}`);
    }
    collector.seen.set(item.id, label);
    collector.items.push(item);
  }
}

function partitionPageUrl(partition: ItemPartition, page: number, pageSize: number): string {
  const params: Record<string, string | number> = { page, size: pageSize, category1: partition.category1 };
  if (partition.category2) params.category2 = partition.category2;
  return withLocale("/dict/search/item", params);
}

async function fetchPartition(
  fetchJson: FetchJson,
  collector: ItemCollector,
  partition: ItemPartition,
  pageSize: number,
): Promise<number> {
  const label = partitionLabel(partition);
  let expectedTotal: number | null = null;
  let fetched = 0;

  for (let page = 1; ; page += 1) {
    const result = await fetchJson(partitionPageUrl(partition, page, pageSize), itemPageSchema);
    collector.pages += 1;
    expectedTotal ??= result.pagination.total;
    assertConsistentPage(label, expectedTotal, result.pagination);
    collectItems(collector, label, result.contents);
    fetched += result.contents.length;
    if (page >= result.pagination.lastPage || result.contents.length === 0) break;
  }

  if (!expectedTotal) throw new CatalogRejected(`${label}: upstream reported no items`);
  if (fetched !== expectedTotal) throw new CatalogRejected(`${label}: fetched ${fetched} of ${expectedTotal} items`);
  return fetched;
}

export async function fetchItemCatalog(fetchJson: FetchJson, pageSize = ITEM_PAGE_SIZE): Promise<ItemCatalog> {
  const grades = await fetchGrades(fetchJson);
  const categories = await fetchCategories(fetchJson);
  const collector: ItemCollector = {
    gradeIds: new Set(grades.map((grade) => grade.id)),
    seen: new Map(),
    items: [],
    pages: 0,
  };

  const itemsByPartition: Record<string, number> = {};
  for (const partition of ITEM_PARTITIONS) {
    itemsByPartition[partitionLabel(partition)] = await fetchPartition(fetchJson, collector, partition, pageSize);
  }

  return {
    grades,
    categories,
    items: collector.items,
    examined: {
      pages: collector.pages,
      grades: grades.length,
      categories: categories.length,
      items: collector.items.length,
      itemsByPartition,
    },
  };
}

export async function writeItemCatalog(db: AnyDatabase, runId: number, catalog: ItemCatalog): Promise<void> {
  await db.transaction(async (tx) => {
    await lockCatalog(tx, "items");
    const previousRunId = await activeRunId(tx, "items");
    if (previousRunId !== null) {
      const [{ value: activeItems }] = await tx
        .select({ value: count() })
        .from(items)
        .where(eq(items.runId, previousRunId));
      assertNotShrunk("items", catalog.items.length, activeItems);
    }

    await tx.insert(itemGrades).values(catalog.grades.map((grade) => ({ runId, ...grade })));
    await tx.insert(itemCategories).values(catalog.categories.map((category) => ({ runId, ...category })));
    for (const batch of chunk(catalog.items, INSERT_BATCH_SIZE)) {
      await tx.insert(items).values(
        batch.map((item) => ({
          runId,
          id: item.id,
          name: item.name,
          iconPath: item.image,
          gradeId: item.grade,
          categoryName: item.categoryName,
          options: item.options,
          description: item.description ?? null,
          tradable: item.tradable,
        })),
      );
    }

    await activateRun(tx, "items", runId, catalog.examined);
  });
}

export async function syncItemCatalog(
  db: AnyDatabase,
  fetchJson: FetchJson,
  pageSize = ITEM_PAGE_SIZE,
): Promise<ItemCatalog> {
  const runId = await startRun(db, "items", itemsSource());
  let examined: Examined = {};
  try {
    const catalog = await fetchItemCatalog(fetchJson, pageSize);
    examined = catalog.examined;
    await writeItemCatalog(db, runId, catalog);
    return catalog;
  } catch (error) {
    await failRun(db, runId, error, examined);
    throw error;
  }
}
