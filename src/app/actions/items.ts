"use server";

import { z } from "zod";
import { resolveSession } from "@/lib/access/party-access";
import { readSessionToken } from "@/lib/access/session-cookie";
import { getDb } from "@/lib/db/client";
import { findSlot, loadItems, searchItems, type CatalogItem } from "@/lib/party/catalog";

const ITEM_RESULTS_LIMIT = 60;

export type ItemSearchResult =
  | { ok: true; items: CatalogItem[]; limited: boolean }
  | { ok: false; reason: "forbidden" | "malformed" | "failed" };

const request = z.object({
  partyId: z.uuid(),
  slotPos: z.number().int().positive(),
  query: z.string().max(80),
  category: z.string().max(60).nullable(),
  gradeIds: z.array(z.string().max(40)).max(10),
});

export async function searchItemsAction(input: unknown): Promise<ItemSearchResult> {
  const parsed = request.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "malformed" };

  const { partyId, slotPos, query, category, gradeIds } = parsed.data;
  try {
    const db = getDb();
    if ((await resolveSession(db, partyId, await readSessionToken())) !== "edit") {
      return { ok: false, reason: "forbidden" };
    }

    const slot = await findSlot(db, slotPos);
    if (!slot || (category !== null && !slot.categories.includes(category))) return { ok: false, reason: "malformed" };

    const found = await searchItems(db, {
      categories: category === null ? slot.categories : [category],
      query,
      gradeIds,
      limit: ITEM_RESULTS_LIMIT + 1,
    });
    return { ok: true, items: found.slice(0, ITEM_RESULTS_LIMIT), limited: found.length > ITEM_RESULTS_LIMIT };
  } catch (error) {
    console.error(`Searching items for party ${partyId} failed`, error);
    return { ok: false, reason: "failed" };
  }
}

const MAX_ITEM_LOOKUP = 200;

const lookup = z.object({
  partyId: z.uuid(),
  itemIds: z.array(z.number().int().positive()).max(MAX_ITEM_LOOKUP),
});

export async function loadItemsAction(input: unknown): Promise<CatalogItem[]> {
  const parsed = lookup.safeParse(input);
  if (!parsed.success) return [];

  const { partyId, itemIds } = parsed.data;
  try {
    const db = getDb();
    if (!(await resolveSession(db, partyId, await readSessionToken()))) return [];
    return await loadItems(db, itemIds);
  } catch (error) {
    console.error(`Loading items for party ${partyId} failed`, error);
    return [];
  }
}
