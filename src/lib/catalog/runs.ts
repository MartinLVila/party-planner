import { and, eq, ne, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "../db/schema";
import { catalogState, syncRuns, type SyncKind } from "../db/schema";

export type AnyDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Transaction = Parameters<Parameters<AnyDatabase["transaction"]>[0]>[0];
export type Examined = Record<string, unknown>;

const TABLES_BY_KIND = {
  classes: [schema.classes],
  items: [schema.items, schema.itemCategories, schema.itemGrades],
  character_sample: [schema.skills, schema.equipmentSlots],
} as const satisfies Record<SyncKind, unknown>;

export async function startRun(db: AnyDatabase, kind: SyncKind, source: string): Promise<number> {
  const [run] = await db.insert(syncRuns).values({ kind, source }).returning({ id: syncRuns.id });
  return run.id;
}

export async function failRun(db: AnyDatabase, runId: number, error: unknown, examined: Examined): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  try {
    await db
      .update(syncRuns)
      .set({ status: "failed", finishedAt: sql`now()`, error: message.slice(0, 2_000), examined })
      .where(and(eq(syncRuns.id, runId), eq(syncRuns.status, "running")));
  } catch (recordingError) {
    console.error(`Could not record the failure of sync run ${runId}`, recordingError);
  }
}

export async function activateRun(tx: Transaction, kind: SyncKind, runId: number, examined: Examined): Promise<void> {
  await tx
    .insert(catalogState)
    .values({ kind, activeRunId: runId })
    .onConflictDoUpdate({
      target: catalogState.kind,
      set: { activeRunId: runId, activatedAt: sql`now()` },
    });

  for (const table of TABLES_BY_KIND[kind]) {
    await tx.delete(table).where(ne(table.runId, runId));
  }

  await tx
    .update(syncRuns)
    .set({ status: "succeeded", finishedAt: sql`now()`, examined })
    .where(eq(syncRuns.id, runId));
}

export async function lockCatalog(tx: Transaction, kind: SyncKind): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`catalog:${kind}`}))`);
}

export async function activeRunId(db: AnyDatabase | Transaction, kind: SyncKind): Promise<number | null> {
  const [state] = await db
    .select({ runId: catalogState.activeRunId })
    .from(catalogState)
    .where(eq(catalogState.kind, kind));
  return state?.runId ?? null;
}

export function chunk<T>(rows: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < rows.length; start += size) chunks.push(rows.slice(start, start + size));
  return chunks;
}

export class CatalogRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogRejected";
  }
}

export const MINIMUM_SHARE_OF_ACTIVE_CATALOG = 0.8;

export function assertNotShrunk(label: string, incoming: number, active: number | null): void {
  if (active === null || active === 0) return;
  if (incoming < active * MINIMUM_SHARE_OF_ACTIVE_CATALOG) {
    throw new CatalogRejected(
      `${label}: ${incoming} would replace ${active}, below ${MINIMUM_SHARE_OF_ACTIVE_CATALOG * 100}% of the active catalog`,
    );
  }
}
