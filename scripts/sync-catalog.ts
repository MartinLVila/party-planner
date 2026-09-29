import "./env";
import { fetchClassCatalog, syncClassCatalog } from "../src/lib/catalog/classes";
import { fetchItemCatalog, syncItemCatalog } from "../src/lib/catalog/items";
import { createDatabase } from "../src/lib/db/client";
import { createUpstreamClient } from "../src/lib/upstream/client";

const TARGETS = ["classes", "items"] as const;
type Target = (typeof TARGETS)[number];

function parseArguments(argv: string[]): { target: Target; dryRun: boolean } {
  const [target, ...flags] = argv;
  if (!TARGETS.includes(target as Target)) {
    throw new Error(`Usage: npm run sync:catalog -- <${TARGETS.join("|")}> [--dry-run]`);
  }
  const unknown = flags.filter((flag) => flag !== "--dry-run");
  if (unknown.length > 0) throw new Error(`Unknown flags: ${unknown.join(" ")}`);
  return { target: target as Target, dryRun: flags.includes("--dry-run") };
}

async function main() {
  const { target, dryRun } = parseArguments(process.argv.slice(2));
  const upstream = createUpstreamClient();
  const started = Date.now();

  let examined: Record<string, unknown>;
  if (dryRun) {
    const catalog =
      target === "classes" ? await fetchClassCatalog(upstream.fetchJson) : await fetchItemCatalog(upstream.fetchJson);
    examined = catalog.examined;
  } else {
    const { db, close } = createDatabase();
    try {
      const catalog =
        target === "classes"
          ? await syncClassCatalog(db, upstream.fetchJson)
          : await syncItemCatalog(db, upstream.fetchJson);
      examined = catalog.examined;
    } finally {
      await close();
    }
  }

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  process.stdout.write(
    `${dryRun ? "Validated" : "Synced"} ${target} with ${upstream.requestCount()} requests in ${seconds}s\n` +
      `${JSON.stringify(examined, null, 2)}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`Catalog sync failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
