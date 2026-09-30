import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const DATA_DIR = ".local-db";
const HOST = "127.0.0.1";
const PORT = Number(process.env.LOCAL_DB_PORT ?? 54329);

async function main() {
  const db = await PGlite.create(DATA_DIR);
  const server = new PGLiteSocketServer({ db, host: HOST, port: PORT, maxConnections: 10 });
  await server.start();

  process.stdout.write(
    `Local Postgres (PGlite) listening on ${HOST}:${PORT}, data in ${DATA_DIR}/\n` +
      `DATABASE_URL=postgresql://postgres@${HOST}:${PORT}/postgres?sslmode=disable\n`,
  );

  const shutdown = async () => {
    await server.stop();
    await db.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  process.stderr.write(`Local database failed to start: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
