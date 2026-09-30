import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findSlot, loadItems, loadPartyCatalog, searchItems } from "../src/lib/party/catalog";
import { GREATSWORD, MAIN_HAND, PET_SLOT, seedCatalog, WING_SLOT } from "./helpers/catalog-fixture";
import { createTestDatabase, type TestDatabase } from "./helpers/database";

let db: TestDatabase;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
  await seedCatalog(db);
});

afterAll(async () => {
  await close();
});

const search = (overrides: Partial<Parameters<typeof searchItems>[1]> = {}) =>
  searchItems(db, { categories: ["Greatsword", "Top"], query: "", gradeIds: [], limit: 50, ...overrides });

describe("item search", () => {
  it("only returns items of the requested categories, best grade first", async () => {
    const found = await search({ categories: ["Greatsword"] });
    expect(found.map((item) => [item.id, item.gradeId])).toEqual([
      [2, "Epic"],
      [1, "Unique"],
      [3, "Legend"],
    ]);
  });

  it("filters by grade and by a case-insensitive name fragment", async () => {
    expect((await search({ gradeIds: ["Unique"] })).map((item) => item.id)).toEqual([1, 11, 12]);
    expect((await search({ query: "item 1" })).map((item) => item.id)).toEqual([1, 11, 12]);
  });

  it.each(["%", "_", "\\\\"])("treats %s in the query as a literal character", async (wildcard) => {
    expect(await search({ query: wildcard })).toEqual([]);
  });

  it("respects the limit", async () => {
    expect(await search({ limit: 2 })).toHaveLength(2);
  });

  it("returns nothing for a slot without categories", async () => {
    expect(await search({ categories: [] })).toEqual([]);
  });
});

describe("catalog lookups", () => {
  it("finds observed and companion slots with their categories", async () => {
    expect(await findSlot(db, MAIN_HAND)).toMatchObject({ slotPosName: "MainHand", group: "weapons" });
    expect(await findSlot(db, WING_SLOT)).toMatchObject({ categories: ["Wings"] });
    expect(await findSlot(db, PET_SLOT)).toMatchObject({ categories: [] });
    expect(await findSlot(db, 77)).toBeNull();
  });

  it("loads equipped items by id and ignores unknown ids", async () => {
    const found = await loadItems(db, [GREATSWORD, GREATSWORD, 999_999]);
    expect(found.map((item) => item.id)).toEqual([GREATSWORD]);
  });

  it("loads the party catalog with every sync present", async () => {
    const catalog = await loadPartyCatalog(db);
    expect(catalog.missing).toEqual([]);
    expect(catalog.classes).toHaveLength(8);
    expect(catalog.grades.map((grade) => grade.name)).toEqual(["Common", "Rare", "Epic", "Unique", "Heroic"]);
    expect(catalog.itemCount).toBe(7);
    expect(catalog.slots.map((slot) => slot.slotPosName)).toEqual(["MainHand", "SubHand", "Wing", "Pet"]);
  });
});
