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
  pcData: { id: number; className: string; raceName: string }[];
  characters: FakeCharacter[];
  failures: Record<string, { status: number } | { body: string }>;
}

export interface FakeCharacter {
  characterId: string;
  serverId: number;
  pcId: number;
  level: number;
  slots: { slotPos: number; slotPosName: string }[];
  skills: {
    id: number;
    name: string;
    category: "Active" | "Passive" | "Dp";
    skillLevel: number;
    needLevel: number;
    acquired: 0 | 1;
    icon: string;
  }[];
}

export function skill(id: number, overrides: Partial<FakeCharacter["skills"][number]> = {}) {
  return {
    id,
    name: `Skill ${id}`,
    category: "Active" as const,
    skillLevel: 10,
    needLevel: 1,
    acquired: 1 as const,
    icon: `${ICON_BASE}ICON_SKILL_${id}.png`,
    ...overrides,
  };
}

const DEFAULT_SLOTS = [
  { slotPos: 1, slotPosName: "MainHand" },
  { slotPos: 2, slotPosName: "SubHand" },
];

function charactersFor(classIndex: number, pcIds: [number, number]): FakeCharacter[] {
  const base = (classIndex + 1) * 1000;
  return pcIds.flatMap((pcId, raceIndex) =>
    [0, 1].map((n) => ({
      characterId: `c${classIndex}-${raceIndex}-${n}%3D`,
      serverId: 1001 + raceIndex,
      pcId,
      level: 50 - n,
      slots: DEFAULT_SLOTS,
      skills: [
        skill(base + 1, { skillLevel: 10 + n }),
        skill(base + 2, { category: "Passive", skillLevel: 34 }),
        skill(base + 3, { category: "Dp", skillLevel: 5, acquired: 0 }),
      ],
    })),
  );
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
    pcData: [],
    characters: [],
    failures: {},
  };
}

export function stateWithCharacters(): FakeUpstreamState {
  const state = defaultState();
  state.classes.forEach((entry, index) => {
    const light = 100 + index * 2;
    const dark = light + 1;
    state.pcData.push(
      { id: light, className: entry.name.toUpperCase(), raceName: "Light" },
      { id: dark, className: entry.name.toUpperCase(), raceName: "Dark" },
    );
    state.characters.push(...charactersFor(index, [light, dark]));
  });
  return state;
}

function respond(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

type Route = (url: URL, state: FakeUpstreamState) => Response;

function searchCharacters(url: URL, state: FakeUpstreamState): Response {
  const pcIds = new Set((url.searchParams.get("pcId") ?? "").split(",").map(Number));
  return respond({
    list: state.characters
      .filter((character) => pcIds.has(character.pcId))
      .map(({ characterId, serverId, pcId, level }) => ({ characterId, serverId, pcId, level })),
  });
}

function characterEquipment(url: URL, state: FakeUpstreamState): Response {
  const character = state.characters.find(
    (candidate) =>
      decodeURIComponent(candidate.characterId) === url.searchParams.get("characterId") &&
      String(candidate.serverId) === url.searchParams.get("serverId"),
  );
  if (!character) return new Response("no such character", { status: 404 });
  return respond({
    equipment: { equipmentList: character.slots },
    petwing: { pet: null, wing: null },
    skill: { skillList: character.skills },
  });
}

function searchItems(url: URL, state: FakeUpstreamState): Response {
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

const ROUTES: [suffix: string, route: Route][] = [
  ["/gameinfo/classes", (_url, state) => respond({ classList: state.classes })],
  ["/gameinfo/pcdata", (_url, state) => respond({ pcDataList: state.pcData })],
  ["/game/item/grade", (_url, state) => respond(state.grades)],
  ["/game/item/category", (_url, state) => respond(state.categories)],
  ["/search/character", searchCharacters],
  ["/character/equipment", characterEquipment],
  ["/dict/search/item", searchItems],
];

function simulatedFailure(failure: FakeUpstreamState["failures"][string]): Response {
  return "status" in failure ? new Response("upstream error", { status: failure.status }) : new Response(failure.body);
}

function requestUrl(input: string | URL | Request): URL {
  if (typeof input === "string") return new URL(input);
  return new URL(input instanceof URL ? input.href : input.url);
}

export function fakeFetch(state: FakeUpstreamState): { fetch: typeof fetch; urls: string[] } {
  const urls: string[] = [];

  const handler = async (input: string | URL | Request): Promise<Response> => {
    const url = requestUrl(input);
    urls.push(url.toString());

    const failure = state.failures[url.pathname];
    if (failure) return simulatedFailure(failure);

    const route = ROUTES.find(([suffix]) => url.pathname.endsWith(suffix));
    return route ? route[1](url, state) : new Response("not found", { status: 404 });
  };

  return { fetch: handler as typeof fetch, urls };
}

export function fakeUpstream(state: FakeUpstreamState = defaultState()) {
  const { fetch, urls } = fakeFetch(state);
  const client = createUpstreamClient({ fetch, minIntervalMs: 0 });
  return { state, urls, fetchJson: client.fetchJson, requestCount: client.requestCount };
}
