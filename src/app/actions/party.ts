"use server";

import { z } from "zod";
import { resolveSession } from "@/lib/access/party-access";
import { readSessionToken } from "@/lib/access/session-cookie";
import { getDb } from "@/lib/db/client";
import { applyPartyChange, partyChangeSchema, type ChangeResult } from "@/lib/party/changes";

export type ApplyChangeResult = ChangeResult | { ok: false; reason: "forbidden" | "malformed" | "failed"; snapshot: null };

const request = z.object({
  partyId: z.uuid(),
  revision: z.number().int().nonnegative(),
  change: partyChangeSchema,
});

export async function applyChangeAction(input: unknown): Promise<ApplyChangeResult> {
  const parsed = request.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "malformed", snapshot: null };

  const { partyId, revision, change } = parsed.data;
  const db = getDb();
  if ((await resolveSession(db, partyId, await readSessionToken())) !== "edit") {
    return { ok: false, reason: "forbidden", snapshot: null };
  }

  try {
    return await applyPartyChange(db, partyId, revision, change);
  } catch (error) {
    console.error(`Applying a ${change.type} change to party ${partyId} failed`, error);
    return { ok: false, reason: "failed", snapshot: null };
  }
}
