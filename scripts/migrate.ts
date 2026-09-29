import "./env";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "../src/lib/db/client";

async function main() {
  const { db, close } = createDatabase();
  try {
    await migrate(db, { migrationsFolder: "drizzle" });
    process.stdout.write("Migrations applied\n");
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`Migration failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
