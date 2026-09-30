import { and, eq, gt, lt, or, sql } from "drizzle-orm";
import type { AnyDatabase, Transaction } from "../catalog/runs";
import { parties, partyPasswordThrottle, partySessions, type AccessLevel } from "../db/schema";
import { generateToken, hashPassword, hashToken, isWellFormedToken, spendPasswordCheck, verifyPassword } from "./secrets";

export const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
export const THROTTLE = { maxFailures: 10, windowMs: 15 * 60 * 1000, lockMs: 15 * 60 * 1000 } as const;

export interface IssuedSession {
  partyId: string;
  access: AccessLevel;
  sessionToken: string;
  expiresAt: Date;
}

export interface PartyLinks {
  editToken: string;
  viewToken: string;
}

export type UnlockResult = ({ ok: true } & IssuedSession) | { ok: false; reason: "invalid" | "locked" };

type Executor = AnyDatabase | Transaction;

async function issueSession(
  db: Executor,
  partyId: string,
  access: AccessLevel,
  credentialVersion: number,
  now: Date,
): Promise<IssuedSession> {
  const sessionToken = generateToken();
  const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS);
  await db.insert(partySessions).values({
    idHash: hashToken(sessionToken),
    partyId,
    access,
    credentialVersion,
    expiresAt,
  });
  return { partyId, access, sessionToken, expiresAt };
}

function newLinks(): PartyLinks & { editTokenHash: Buffer; viewTokenHash: Buffer } {
  const editToken = generateToken();
  const viewToken = generateToken();
  return { editToken, viewToken, editTokenHash: hashToken(editToken), viewTokenHash: hashToken(viewToken) };
}

export async function createParty(
  db: AnyDatabase,
  input: { name: string; password: string },
  now = new Date(),
): Promise<IssuedSession & PartyLinks> {
  const links = newLinks();
  const passwordHash = await hashPassword(input.password);

  return db.transaction(async (tx) => {
    const [party] = await tx
      .insert(parties)
      .values({
        name: input.name,
        editTokenHash: links.editTokenHash,
        viewTokenHash: links.viewTokenHash,
        passwordHash,
      })
      .returning({ id: parties.id, credentialVersion: parties.credentialVersion });
    const session = await issueSession(tx, party.id, "edit", party.credentialVersion, now);
    return { ...session, editToken: links.editToken, viewToken: links.viewToken };
  });
}

async function isLocked(db: Executor, partyId: string, now: Date): Promise<boolean> {
  const [throttle] = await db
    .select({ lockedUntil: partyPasswordThrottle.lockedUntil })
    .from(partyPasswordThrottle)
    .where(eq(partyPasswordThrottle.partyId, partyId));
  return Boolean(throttle?.lockedUntil && throttle.lockedUntil > now);
}

async function recordAttempt(db: Executor, partyId: string, now: Date): Promise<number> {
  const windowStart = new Date(now.getTime() - THROTTLE.windowMs);
  const lockUntil = new Date(now.getTime() + THROTTLE.lockMs);
  const staleWindow = sql`${partyPasswordThrottle.windowStartedAt} < ${windowStart.toISOString()}::timestamptz`;
  const failures = sql`CASE WHEN ${staleWindow} THEN 1 ELSE ${partyPasswordThrottle.failures} + 1 END`;

  const [throttle] = await db
    .insert(partyPasswordThrottle)
    .values({ partyId, failures: 1, windowStartedAt: now })
    .onConflictDoUpdate({
      target: partyPasswordThrottle.partyId,
      set: {
        failures,
        windowStartedAt: sql`CASE WHEN ${staleWindow} THEN ${now.toISOString()}::timestamptz ELSE ${partyPasswordThrottle.windowStartedAt} END`,
        lockedUntil: sql`CASE WHEN ${failures} >= ${THROTTLE.maxFailures} THEN ${lockUntil.toISOString()}::timestamptz ELSE NULL END`,
      },
    })
    .returning({ failures: partyPasswordThrottle.failures });
  return throttle.failures;
}

async function clearFailures(db: Executor, partyId: string): Promise<void> {
  await db.delete(partyPasswordThrottle).where(eq(partyPasswordThrottle.partyId, partyId));
}

async function findPartyByToken(db: Executor, token: string) {
  const tokenHash = hashToken(token);
  const [party] = await db
    .select({
      id: parties.id,
      passwordHash: parties.passwordHash,
      credentialVersion: parties.credentialVersion,
      editTokenHash: parties.editTokenHash,
    })
    .from(parties)
    .where(or(eq(parties.editTokenHash, tokenHash), eq(parties.viewTokenHash, tokenHash)));
  if (!party) return null;
  const access: AccessLevel = party.editTokenHash.equals(tokenHash) ? "edit" : "view";
  return { ...party, access };
}

export async function unlockParty(
  db: AnyDatabase,
  input: { token: string; password: string },
  now = new Date(),
): Promise<UnlockResult> {
  const party = isWellFormedToken(input.token) ? await findPartyByToken(db, input.token) : null;
  if (!party) {
    await spendPasswordCheck(input.password);
    return { ok: false, reason: "invalid" };
  }

  if (await isLocked(db, party.id, now)) return { ok: false, reason: "locked" };

  const attempts = await recordAttempt(db, party.id, now);
  if (attempts > THROTTLE.maxFailures) return { ok: false, reason: "locked" };

  if (!(await verifyPassword(input.password, party.passwordHash))) {
    return attempts >= THROTTLE.maxFailures ? { ok: false, reason: "locked" } : { ok: false, reason: "invalid" };
  }

  return db.transaction(async (tx) => {
    await clearFailures(tx, party.id);
    await tx
      .delete(partySessions)
      .where(and(eq(partySessions.partyId, party.id), lt(partySessions.expiresAt, now)));
    const session = await issueSession(tx, party.id, party.access, party.credentialVersion, now);
    return { ok: true as const, ...session };
  });
}

export async function resolveSession(
  db: AnyDatabase,
  partyId: string,
  sessionToken: string | undefined,
  now = new Date(),
): Promise<AccessLevel | null> {
  if (!sessionToken || !isWellFormedToken(sessionToken)) return null;
  const [session] = await db
    .select({ access: partySessions.access })
    .from(partySessions)
    .innerJoin(parties, eq(parties.id, partySessions.partyId))
    .where(
      and(
        eq(partySessions.idHash, hashToken(sessionToken)),
        eq(partySessions.partyId, partyId),
        eq(partySessions.credentialVersion, parties.credentialVersion),
        gt(partySessions.expiresAt, now),
      ),
    );
  return session?.access ?? null;
}

async function resetCredentials(
  tx: Transaction,
  partyId: string,
  changes: Partial<typeof parties.$inferInsert>,
  now: Date,
): Promise<IssuedSession> {
  const [party] = await tx
    .update(parties)
    .set({ ...changes, credentialVersion: sql`${parties.credentialVersion} + 1`, updatedAt: now })
    .where(eq(parties.id, partyId))
    .returning({ credentialVersion: parties.credentialVersion });
  if (!party) throw new Error(`party ${partyId} does not exist`);
  await tx.delete(partySessions).where(eq(partySessions.partyId, partyId));
  await clearFailures(tx, partyId);
  return issueSession(tx, partyId, "edit", party.credentialVersion, now);
}

export async function rotateLinks(
  db: AnyDatabase,
  partyId: string,
  now = new Date(),
): Promise<IssuedSession & PartyLinks> {
  const links = newLinks();
  return db.transaction(async (tx) => {
    const session = await resetCredentials(
      tx,
      partyId,
      { editTokenHash: links.editTokenHash, viewTokenHash: links.viewTokenHash },
      now,
    );
    return { ...session, editToken: links.editToken, viewToken: links.viewToken };
  });
}

export async function changePassword(
  db: AnyDatabase,
  partyId: string,
  newPassword: string,
  now = new Date(),
): Promise<IssuedSession> {
  const passwordHash = await hashPassword(newPassword);
  return db.transaction((tx) => resetCredentials(tx, partyId, { passwordHash }, now));
}
