import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { AnyDatabase } from "../catalog/runs";
import { rateLimits } from "../db/schema";

export interface RateLimit {
  name: string;
  maxAttempts: number;
  windowMs: number;
}

export const CREATION_CODE_LIMIT: RateLimit = { name: "creation-code", maxAttempts: 5, windowMs: 15 * 60 * 1000 };

export function rateLimitKey(limit: RateLimit, subject: string): string {
  return `${limit.name}:${createHash("sha256").update(subject, "utf8").digest("base64url")}`;
}

export async function takeAttempt(db: AnyDatabase, limit: RateLimit, subject: string, now = new Date()): Promise<boolean> {
  const windowStart = new Date(now.getTime() - limit.windowMs);
  const staleWindow = sql`${rateLimits.windowStartedAt} < ${windowStart.toISOString()}::timestamptz`;

  const [row] = await db
    .insert(rateLimits)
    .values({ key: rateLimitKey(limit, subject), attempts: 1, windowStartedAt: now })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        attempts: sql`CASE WHEN ${staleWindow} THEN 1 ELSE ${rateLimits.attempts} + 1 END`,
        windowStartedAt: sql`CASE WHEN ${staleWindow} THEN ${now.toISOString()}::timestamptz ELSE ${rateLimits.windowStartedAt} END`,
      },
    })
    .returning({ attempts: rateLimits.attempts });
  return row.attempts <= limit.maxAttempts;
}

export async function forgetAttempts(db: AnyDatabase, limit: RateLimit, subject: string): Promise<void> {
  await db.delete(rateLimits).where(eq(rateLimits.key, rateLimitKey(limit, subject)));
}
