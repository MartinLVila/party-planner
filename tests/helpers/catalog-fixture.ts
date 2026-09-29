import { syncCharacterSample } from "../../src/lib/catalog/character-sample";
import { syncClassCatalog } from "../../src/lib/catalog/classes";
import { syncItemCatalog } from "../../src/lib/catalog/items";
import type { TestDatabase } from "./database";
import { fakeUpstream, stateWithCharacters } from "./fake-upstream";

export const GLADIATOR = 2;
export const TEMPLAR = 3;
export const GLADIATOR_ACTIVE_SKILL = 1001;
export const GLADIATOR_PASSIVE_SKILL = 1002;
export const TEMPLAR_ACTIVE_SKILL = 2001;
export const GREATSWORD = 1;
export const TOP = 11;
export const RING = 21;
export const WINGS = 31;
export const MAIN_HAND = 1;
export const SUB_HAND = 2;
export const WING_SLOT = 101;
export const PET_SLOT = 102;

export async function seedCatalog(db: TestDatabase): Promise<void> {
  const upstream = fakeUpstream(stateWithCharacters());
  await syncClassCatalog(db, upstream.fetchJson);
  await syncItemCatalog(db, upstream.fetchJson);
  await syncCharacterSample(db, upstream.fetchJson);
}
