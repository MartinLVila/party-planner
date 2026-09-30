import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const POOL_SIZE = 5;
const IDLE_TIMEOUT_MS = 5_000;

export function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return url;
}

export function createDatabase() {
  const pool = new Pool({ connectionString: connectionString(), max: POOL_SIZE, idleTimeoutMillis: IDLE_TIMEOUT_MS });
  attachDatabasePool(pool);
  return {
    db: drizzle(pool, { schema }),
    close: () => pool.end(),
  };
}

export type Database = ReturnType<typeof createDatabase>["db"];

let shared: Database | undefined;

export function getDb(): Database {
  shared ??= createDatabase().db;
  return shared;
}
