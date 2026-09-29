import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../../src/lib/db/schema";

const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");

export type TestDatabase = ReturnType<typeof drizzle<typeof schema>>;

async function migrationFilesInOrder(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_DIR);
  return entries.filter((entry) => entry.endsWith(".sql")).sort();
}

export async function createTestDatabase(): Promise<{ db: TestDatabase; close: () => Promise<void> }> {
  const client = new PGlite();
  await client.waitReady;

  const files = await migrationFilesInOrder();
  if (files.length === 0) throw new Error(`No migrations found in ${MIGRATIONS_DIR}`);

  for (const file of files) {
    const migration = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    for (const statement of migration.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (trimmed.length > 0) await client.exec(trimmed);
    }
  }

  return {
    db: drizzle(client, { schema }),
    close: () => client.close(),
  };
}
