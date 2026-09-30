import { count, eq } from "drizzle-orm";
import { classes } from "../db/schema";
import { SITE_API, type FetchJson } from "../upstream/client";
import { classListSchema } from "../upstream/schemas";
import {
  activateRun,
  activeRunId,
  assertNotShrunk,
  CatalogRejected,
  failRun,
  lockCatalog,
  startRun,
  type AnyDatabase,
  type Examined,
} from "./runs";

export const MINIMUM_CLASS_COUNT = 8;

export interface ClassCatalog {
  classes: { id: number; name: string; displayName: string }[];
  examined: Examined;
}

export function classesSource(): string {
  return `${SITE_API}/gameinfo/classes?lang=en`;
}

export async function fetchClassCatalog(fetchJson: FetchJson): Promise<ClassCatalog> {
  const { classList } = await fetchJson(classesSource(), classListSchema);

  const ids = new Set(classList.map((entry) => entry.id));
  if (ids.size !== classList.length) throw new CatalogRejected("class ids are not unique");
  if (classList.length < MINIMUM_CLASS_COUNT) {
    throw new CatalogRejected(`expected at least ${MINIMUM_CLASS_COUNT} classes, got ${classList.length}`);
  }

  return {
    classes: classList.map((entry) => ({ id: entry.id, name: entry.name, displayName: entry.text })),
    examined: { classes: classList.length },
  };
}

export async function writeClassCatalog(db: AnyDatabase, runId: number, catalog: ClassCatalog): Promise<void> {
  await db.transaction(async (tx) => {
    await lockCatalog(tx, "classes");
    const previousRunId = await activeRunId(tx, "classes");
    if (previousRunId !== null) {
      const [{ value: activeClasses }] = await tx
        .select({ value: count() })
        .from(classes)
        .where(eq(classes.runId, previousRunId));
      assertNotShrunk("classes", catalog.classes.length, activeClasses);
    }

    await tx.insert(classes).values(catalog.classes.map((entry) => ({ runId, ...entry })));
    await activateRun(tx, "classes", runId, catalog.examined);
  });
}

export async function syncClassCatalog(db: AnyDatabase, fetchJson: FetchJson): Promise<ClassCatalog> {
  const runId = await startRun(db, "classes", classesSource());
  let examined: Examined = {};
  try {
    const catalog = await fetchClassCatalog(fetchJson);
    examined = catalog.examined;
    await writeClassCatalog(db, runId, catalog);
    return catalog;
  } catch (error) {
    await failRun(db, runId, error, examined);
    throw error;
  }
}
