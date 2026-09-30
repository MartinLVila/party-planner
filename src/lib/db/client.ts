import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

export function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return url;
}

export function createDatabase() {
  const pool = new Pool({ connectionString: connectionString() });
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
