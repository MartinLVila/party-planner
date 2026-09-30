import { createUpstreamClient } from "../../src/lib/upstream/client";

const ICON_BASE = "https://assets.playnccdn.com/static-aion2-gamedata/resources/";

export interface FakeItem {
  id: number;
  name: string;
  image: string;
  grade: string;
  options?: string[];
  description?: string;
  tradable: boolean;
  categoryName: string;
}

export interface FakeUpstreamState {
  classes: { id: number; name: string; text: string }[];
  grades: { id: string; name: string }[];
  categories: { id: string; name: string; child: { id: string; name: string }[] }[];
  itemsByPartition: Record<string, FakeItem[]>;
  reportedTotals: Record<string, number>;
  failures: Record<string, { status: number } | { body: string }>;
}

export function item(id: number, overrides: Partial<FakeItem> = {}): FakeItem {
  return {
    id,
    name: `Item ${id}`,
    image: `${ICON_BASE}Icon_${id}.png`,
    grade: "Unique",
    options: ["Attack 100"],
    tradable: true,
    categoryName: "Greatsword",
    ...overrides,
  };
}

export function defaultState(): FakeUpstreamState {
  return {
    classes: [
      { id: 2, name: "Gladiator", text: "Gladiator" },
      { id: 3, name: "Templar", text: "Templar" },
      { id: 4, name: "Ranger", text: "Ranger" },
      { id: 5, name: "Assassin", text: "Assassin" },
      { id: 6, name: "Elementalist", text: "Spiritmaster" },
      { id: 7, name: "Sorcerer", text: "Sorcerer" },
      { id: 8, name: "Cleric", text: "Cleric" },
      { id: 9, name: "Chanter", text: "Chanter" },
    ],
    grades: [
      { id: "Common", name: "Common" },
      { id: "Rare", name: "Rare" },
      { id: "Legend", name: "Epic" },
      { id: "Unique", name: "Unique" },
      { id: "Epic", name: "Heroic" },
    ],
    categories: [
      { id: "Equip_Weapon", name: "Weapons", child: [{ id: "Greatsword", name: "Greatsword" }] },
      { id: "Equip_Armor", name: "Armor", child: [{ id: "Torso", name: "Top" }] },
      { id: "Equip_Accessory", name: "Accessories", child: [{ id: "Ring", name: "Ring" }] },
      { id: "Usable_001", name: "Consumables", child: [{ id: "Wing", name: "Wings" }] },
    ],
    itemsByPartition: {
      Equip_Weapon: [item(1), item(2, { grade: "Epic" }), item(3, { grade: "Legend" })],
      Equip_Armor: [item(11, { categoryName: "Top" }), item(12, { categoryName: "Top" })],
      Equip_Accessory: [item(21, { categoryName: "Ring" })],
      "Usable_001/Wing": [item(31, { categoryName: "Wings", options: undefined, description: "Grants wings." })],
    },
    reportedTotals: {},
    failures: {},
  };
}

function respond(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

export function fakeFetch(state: FakeUpstreamState): { fetch: typeof fetch; urls: string[] } {
  const urls: string[] = [];

  const handler = async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    urls.push(url.toString());

    const failure = state.failures[url.pathname];
    if (failure) {
      return "status" in failure ? new Response("upstream error", { status: failure.status }) : new Response(failure.body);
    }

    if (url.pathname.endsWith("/gameinfo/classes")) return respond({ classList: state.classes });
    if (url.pathname.endsWith("/game/item/grade")) return respond(state.grades);
    if (url.pathname.endsWith("/game/item/category")) return respond(state.categories);

    if (url.pathname.endsWith("/dict/search/item")) {
      const category1 = url.searchParams.get("category1") ?? "";
      const category2 = url.searchParams.get("category2");
      const label = category2 ? `${category1}/${category2}` : category1;
      const all = state.itemsByPartition[label] ?? [];
      const page = Number(url.searchParams.get("page"));
      const size = Number(url.searchParams.get("size"));
      const total = state.reportedTotals[label] ?? all.length;
      return respond({
        contents: all.slice((page - 1) * size, page * size),
        pagination: { page, size, lastPage: Math.ceil(total / size), total, limit: 10000 },
      });
    }

    return new Response("not found", { status: 404 });
  };

  return { fetch: handler as typeof fetch, urls };
}

export function fakeUpstream(state: FakeUpstreamState = defaultState()) {
  const { fetch, urls } = fakeFetch(state);
  const client = createUpstreamClient({ fetch, minIntervalMs: 0 });
  return { state, urls, fetchJson: client.fetchJson, requestCount: client.requestCount };
}
