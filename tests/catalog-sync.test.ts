import { asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncClassCatalog } from "../src/lib/catalog/classes";
import { syncItemCatalog } from "../src/lib/catalog/items";
import { catalogState, classes, itemCategories, itemGrades, items, syncRuns } from "../src/lib/db/schema";
import { createTestDatabase, type TestDatabase } from "./helpers/database";
import { fakeUpstream, item } from "./helpers/fake-upstream";

let db: TestDatabase;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});

afterEach(async () => {
  await close();
});

const runs = () => db.select().from(syncRuns).orderBy(asc(syncRuns.id));
const activeRun = async (kind: "classes" | "items") =>
  (await db.select().from(catalogState).where(eq(catalogState.kind, kind)))[0]?.activeRunId ?? null;
const itemIds = async () => (await db.select({ id: items.id }).from(items).orderBy(asc(items.id))).map((row) => row.id);

describe("class sync", () => {
  it("stores every class with the name players see and activates the run", async () => {
    const upstream = fakeUpstream();

    await syncClassCatalog(db, upstream.fetchJson);

    const stored = await db.select().from(classes).orderBy(asc(classes.id));
    expect(stored).toHaveLength(8);
    expect(stored.find((entry) => entry.id === 6)).toMatchObject({ name: "Elementalist", displayName: "Spiritmaster" });
    expect(stored.every((entry) => entry.skillPointCap === null)).toBe(true);

    const [run] = await runs();
    expect(run).toMatchObject({ kind: "classes", status: "succeeded", examined: { classes: 8 }, error: null });
    expect(await activeRun("classes")).toBe(run.id);
  });

  it("records a failed run and writes nothing when upstream returns too few classes", async () => {
    const upstream = fakeUpstream();
    upstream.state.classes = upstream.state.classes.slice(0, 3);

    await expect(syncClassCatalog(db, upstream.fetchJson)).rejects.toThrow("expected at least 8 classes, got 3");

    expect(await db.select().from(classes)).toHaveLength(0);
    expect(await activeRun("classes")).toBeNull();
    const [run] = await runs();
    expect(run.status).toBe("failed");
    expect(run.error).toContain("expected at least 8 classes");
    expect(run.finishedAt).not.toBeNull();
  });

  it("records the HTTP status when upstream is down", async () => {
    const upstream = fakeUpstream();
    upstream.state.failures["/aion2/api/gameinfo/classes"] = { status: 503 };

    await expect(syncClassCatalog(db, upstream.fetchJson)).rejects.toThrow("HTTP 503");

    const [run] = await runs();
    expect(run.status).toBe("failed");
    expect(run.error).toContain("HTTP 503");
  });

  it("records a response that is not JSON", async () => {
    const upstream = fakeUpstream();
    upstream.state.failures["/aion2/api/gameinfo/classes"] = { body: "<html>maintenance</html>" };

    await expect(syncClassCatalog(db, upstream.fetchJson)).rejects.toThrow("response is not JSON");
    expect((await runs())[0].status).toBe("failed");
  });
});

describe("item sync", () => {
  it("stores grades in upstream order, categories with their parent, and every item", async () => {
    const upstream = fakeUpstream();

    const catalog = await syncItemCatalog(db, upstream.fetchJson);

    expect(await itemIds()).toEqual([1, 2, 3, 11, 12, 21, 31]);
    const grades = await db.select().from(itemGrades).orderBy(asc(itemGrades.rank));
    expect(grades.map((grade) => [grade.id, grade.name])).toEqual([
      ["Common", "Common"],
      ["Rare", "Rare"],
      ["Legend", "Epic"],
      ["Unique", "Unique"],
      ["Epic", "Heroic"],
    ]);
    const torso = (await db.select().from(itemCategories).where(eq(itemCategories.id, "Torso")))[0];
    expect(torso).toMatchObject({ name: "Top", parentId: "Equip_Armor" });

    const [wings] = await db.select().from(items).where(eq(items.id, 31));
    expect(wings).toMatchObject({ options: [], description: "Grants wings.", iconPath: "Icon_31.png" });

    expect(catalog.examined).toMatchObject({
      items: 7,
      itemsByPartition: { Equip_Weapon: 3, Equip_Armor: 2, Equip_Accessory: 1, "Usable_001/Wing": 1 },
    });
    const [run] = await runs();
    expect(run.status).toBe("succeeded");
    expect(await activeRun("items")).toBe(run.id);
  });

  it("follows pagination until every item of a partition is collected", async () => {
    const upstream = fakeUpstream();

    await syncItemCatalog(db, upstream.fetchJson, 2);

    expect(await itemIds()).toEqual([1, 2, 3, 11, 12, 21, 31]);
    const weaponPages = upstream.urls.filter((url) => url.includes("category1=Equip_Weapon"));
    expect(weaponPages).toHaveLength(2);
  });

  it("always asks for English data", async () => {
    const upstream = fakeUpstream();

    await syncItemCatalog(db, upstream.fetchJson);

    const dictionaryUrls = upstream.urls.filter((url) => url.includes("/aion2_tw/"));
    expect(dictionaryUrls.length).toBeGreaterThan(0);
    expect(dictionaryUrls.every((url) => new URL(url).searchParams.get("locale") === "en-US")).toBe(true);
  });

  describe("keeps the active catalog when a new sync", () => {
    let firstRunId: number;

    beforeEach(async () => {
      await syncItemCatalog(db, fakeUpstream().fetchJson);
      firstRunId = (await runs())[0].id;
    });

    async function expectFirstCatalogUntouched() {
      expect(await activeRun("items")).toBe(firstRunId);
      expect(await itemIds()).toEqual([1, 2, 3, 11, 12, 21, 31]);
      const latest = (await runs()).at(-1);
      expect(latest?.status).toBe("failed");
      return latest;
    }

    it("receives an item whose icon is not on the game CDN", async () => {
      const upstream = fakeUpstream();
      upstream.state.itemsByPartition.Equip_Weapon[0] = item(1, { image: "https://evil.example/x.png" });

      await expect(syncItemCatalog(db, upstream.fetchJson)).rejects.toThrow("failed validation");
      const run = await expectFirstCatalogUntouched();
      expect(run?.error).toContain("contents.0.image");
    });

    it("gets fewer items than upstream says exist", async () => {
      const upstream = fakeUpstream();
      upstream.state.reportedTotals.Equip_Armor = 3;

      await expect(syncItemCatalog(db, upstream.fetchJson)).rejects.toThrow("Equip_Armor: fetched 2 of 3 items");
      await expectFirstCatalogUntouched();
    });

    it("sees the same item in two partitions", async () => {
      const upstream = fakeUpstream();
      upstream.state.itemsByPartition.Equip_Armor.push(item(1, { categoryName: "Top" }));

      await expect(syncItemCatalog(db, upstream.fetchJson)).rejects.toThrow("item 1 appeared twice");
      await expectFirstCatalogUntouched();
    });

    it("sees an item with a grade upstream does not list", async () => {
      const upstream = fakeUpstream();
      upstream.state.itemsByPartition.Equip_Accessory[0] = item(21, { grade: "Mythic", categoryName: "Ring" });

      await expect(syncItemCatalog(db, upstream.fetchJson)).rejects.toThrow("unknown grade Mythic");
      await expectFirstCatalogUntouched();
    });

    it("finds a partition empty", async () => {
      const upstream = fakeUpstream();
      upstream.state.itemsByPartition["Usable_001/Wing"] = [];

      await expect(syncItemCatalog(db, upstream.fetchJson)).rejects.toThrow("Usable_001/Wing: upstream reported no items");
      await expectFirstCatalogUntouched();
    });

    it("finds a category it syncs missing from the category list", async () => {
      const upstream = fakeUpstream();
      upstream.state.categories = upstream.state.categories.filter((category) => category.id !== "Equip_Accessory");

      await expect(syncItemCatalog(db, upstream.fetchJson)).rejects.toThrow(
        "upstream no longer lists category Equip_Accessory",
      );
      await expectFirstCatalogUntouched();
    });

    it("would shrink the catalog below 80% of the active one", async () => {
      const upstream = fakeUpstream();
      upstream.state.itemsByPartition.Equip_Weapon = [item(1)];
      upstream.state.itemsByPartition.Equip_Armor = [item(11, { categoryName: "Top" })];

      await expect(syncItemCatalog(db, upstream.fetchJson)).rejects.toThrow("items: 4 would replace 7");
      await expectFirstCatalogUntouched();
    });
  });

  it("replaces the active catalog and removes the old rows after a complete sync", async () => {
    await syncItemCatalog(db, fakeUpstream().fetchJson);

    const upstream = fakeUpstream();
    upstream.state.itemsByPartition.Equip_Weapon.push(item(4, { name: "New Greatsword" }));
    await syncItemCatalog(db, upstream.fetchJson);

    const [, second] = await runs();
    expect(await activeRun("items")).toBe(second.id);
    expect(await itemIds()).toEqual([1, 2, 3, 4, 11, 12, 21, 31]);
    const leftovers = await db.select().from(items).where(eq(items.runId, second.id - 1));
    expect(leftovers).toHaveLength(0);
    expect(await db.select().from(itemGrades)).toHaveLength(5);
  });
});
