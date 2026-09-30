import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkCreationCode } from "../src/lib/access/creation-code";
import {
  changePassword,
  createParty,
  resolveSession,
  rotateLinks,
  SESSION_LIFETIME_MS,
  THROTTLE,
  unlockParty,
} from "../src/lib/access/party-access";
import { generateToken, hashPassword, hashToken, verifyPassword } from "../src/lib/access/secrets";
import { parties, partySessions } from "../src/lib/db/schema";
import { createTestDatabase, type TestDatabase } from "./helpers/database";

let db: TestDatabase;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
});

afterAll(async () => {
  await close();
});

const PASSWORD = "jueves-de-raid";
const minutes = (count: number) => count * 60 * 1000;
const later = (from: Date, ms: number) => new Date(from.getTime() + ms);

async function newParty(now = new Date()) {
  return createParty(db, { name: "Raid del jueves", password: PASSWORD }, now);
}

async function wrongAttempts(token: string, count: number, now: Date) {
  const results = [];
  for (let attempt = 0; attempt < count; attempt += 1) {
    results.push(await unlockParty(db, { token, password: "not-the-password" }, now));
  }
  return results;
}

describe("creating a party", () => {
  it("hands out edit and view links once and keeps only their hashes", async () => {
    const party = await newParty();

    expect(party.editToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(party.viewToken).not.toBe(party.editToken);
    expect(party.access).toBe("edit");

    const { rows } = await db.execute(sql`SELECT row_to_json(p)::text AS row FROM parties p WHERE id = ${party.partyId}`);
    const stored = String((rows[0] as { row: string }).row);
    expect(stored).not.toContain(party.editToken);
    expect(stored).not.toContain(party.viewToken);
    expect(stored).not.toContain(PASSWORD);
    expect(stored).toContain("scrypt:");
  });

  it("gives the creator an edit session right away", async () => {
    const party = await newParty();
    expect(await resolveSession(db, party.partyId, party.sessionToken)).toBe("edit");
  });
});

describe("unlocking a party", () => {
  it("grants edit with the edit link and view with the view link", async () => {
    const party = await newParty();

    const edit = await unlockParty(db, { token: party.editToken, password: PASSWORD });
    const view = await unlockParty(db, { token: party.viewToken, password: PASSWORD });

    expect(edit).toMatchObject({ ok: true, access: "edit", partyId: party.partyId });
    expect(view).toMatchObject({ ok: true, access: "view", partyId: party.partyId });
  });

  it.each([
    ["a wrong password", (token: string) => ({ token, password: "wrong-password" })],
    ["an unknown link", () => ({ token: generateToken(), password: PASSWORD })],
    ["a malformed link", () => ({ token: "not a token", password: PASSWORD })],
  ])("answers the same way for %s", async (_label, input) => {
    const party = await newParty();
    expect(await unlockParty(db, input(party.editToken))).toEqual({ ok: false, reason: "invalid" });
  });

  it(`locks after ${THROTTLE.maxFailures} wrong passwords, even for the right one`, async () => {
    const now = new Date();
    const party = await newParty(now);

    const results = await wrongAttempts(party.editToken, THROTTLE.maxFailures, now);

    expect(results.slice(0, -1).every((result) => !result.ok && result.reason === "invalid")).toBe(true);
    expect(results.at(-1)).toEqual({ ok: false, reason: "locked" });
    expect(await unlockParty(db, { token: party.editToken, password: PASSWORD }, now)).toEqual({
      ok: false,
      reason: "locked",
    });
  });

  it("opens again once the lock expires, and clears the count on success", async () => {
    const now = new Date();
    const party = await newParty(now);
    await wrongAttempts(party.editToken, THROTTLE.maxFailures, now);

    const afterLock = later(now, THROTTLE.lockMs + minutes(1));
    expect(await unlockParty(db, { token: party.editToken, password: PASSWORD }, afterLock)).toMatchObject({ ok: true });

    const moreFailures = await wrongAttempts(party.editToken, THROTTLE.maxFailures - 1, afterLock);
    expect(moreFailures.every((result) => !result.ok && result.reason === "invalid")).toBe(true);
  });

  it("forgets failures older than the window", async () => {
    const now = new Date();
    const party = await newParty(now);
    await wrongAttempts(party.editToken, THROTTLE.maxFailures - 1, now);

    const nextWindow = later(now, THROTTLE.windowMs + minutes(1));
    const results = await wrongAttempts(party.editToken, THROTTLE.maxFailures - 1, nextWindow);

    expect(results.every((result) => !result.ok && result.reason === "invalid")).toBe(true);
  });

  it("keeps the lock for its full duration even after the failure window has passed", async () => {
    const start = new Date();
    const party = await newParty(start);
    await wrongAttempts(party.editToken, 1, start);
    const lastFailure = later(start, THROTTLE.windowMs - minutes(1));
    await wrongAttempts(party.editToken, THROTTLE.maxFailures - 1, lastFailure);

    const windowOverButStillLocked = later(lastFailure, minutes(5));
    expect(await unlockParty(db, { token: party.editToken, password: PASSWORD }, windowOverButStillLocked)).toEqual({
      ok: false,
      reason: "locked",
    });
  });

  it("does not let a concurrent burst reach the right password past the limit", async () => {
    const now = new Date();
    const party = await newParty(now);
    const wrong = Array.from({ length: THROTTLE.maxFailures + 2 }, () => ({
      token: party.editToken,
      password: "not-the-password",
    }));

    const results = await Promise.all(
      [...wrong, { token: party.editToken, password: PASSWORD }].map((input) => unlockParty(db, input, now)),
    );

    expect(results.at(-1)).toEqual({ ok: false, reason: "locked" });
    expect(results.filter((result) => result.ok)).toHaveLength(0);
  });

  it("does not count failures on one party against another", async () => {
    const now = new Date();
    const first = await newParty(now);
    const second = await newParty(now);
    await wrongAttempts(first.editToken, THROTTLE.maxFailures, now);

    expect(await unlockParty(db, { token: second.editToken, password: PASSWORD }, now)).toMatchObject({ ok: true });
  });
});

describe("sessions", () => {
  it("only work for the party they were issued for", async () => {
    const first = await newParty();
    const second = await newParty();
    expect(await resolveSession(db, second.partyId, first.sessionToken)).toBeNull();
  });

  it("expire after their lifetime", async () => {
    const now = new Date();
    const party = await newParty(now);
    expect(await resolveSession(db, party.partyId, party.sessionToken, later(now, SESSION_LIFETIME_MS - 1000))).toBe(
      "edit",
    );
    expect(await resolveSession(db, party.partyId, party.sessionToken, later(now, SESSION_LIFETIME_MS + 1000))).toBeNull();
  });

  it("ignore a session issued under credentials that have since changed", async () => {
    const party = await newParty();
    const staleToken = generateToken();
    await db.update(parties).set({ credentialVersion: 2 }).where(eq(parties.id, party.partyId));
    await db.insert(partySessions).values({
      idHash: hashToken(staleToken),
      partyId: party.partyId,
      access: "edit",
      credentialVersion: 1,
      expiresAt: later(new Date(), minutes(60)),
    });

    expect(await resolveSession(db, party.partyId, staleToken)).toBeNull();
  });

  it.each([undefined, "", "garbage", generateToken()])("reject %s", async (token) => {
    const party = await newParty();
    expect(await resolveSession(db, party.partyId, token)).toBeNull();
  });
});

describe("rotating links", () => {
  it("retires the old links and every existing session", async () => {
    const party = await newParty();
    const friend = await unlockParty(db, { token: party.viewToken, password: PASSWORD });

    const rotated = await rotateLinks(db, party.partyId);

    expect(await resolveSession(db, party.partyId, party.sessionToken)).toBeNull();
    expect(friend.ok && (await resolveSession(db, party.partyId, friend.sessionToken))).toBeNull();
    expect(await unlockParty(db, { token: party.editToken, password: PASSWORD })).toEqual({ ok: false, reason: "invalid" });
    expect(await unlockParty(db, { token: rotated.viewToken, password: PASSWORD })).toMatchObject({ ok: true, access: "view" });
    expect(await resolveSession(db, party.partyId, rotated.sessionToken)).toBe("edit");
  });
});

describe("changing the password", () => {
  it("retires the old password and every existing session", async () => {
    const party = await newParty();

    const session = await changePassword(db, party.partyId, "otra-clave-nueva");

    expect(await resolveSession(db, party.partyId, party.sessionToken)).toBeNull();
    expect(await unlockParty(db, { token: party.editToken, password: PASSWORD })).toEqual({ ok: false, reason: "invalid" });
    expect(await unlockParty(db, { token: party.editToken, password: "otra-clave-nueva" })).toMatchObject({ ok: true });
    expect(await resolveSession(db, party.partyId, session.sessionToken)).toBe("edit");
  });
});

describe("password hashing", () => {
  it("verifies the right password and rejects others", async () => {
    const hash = await hashPassword("una-clave-larga");
    expect(await verifyPassword("una-clave-larga", hash)).toBe(true);
    expect(await verifyPassword("una-clave-larg", hash)).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("misma-clave")).not.toBe(await hashPassword("misma-clave"));
  });

  it.each(["", "plain", "scrypt:x:8:1:abc:def", "bcrypt:1:2:3:a:b", "scrypt:1024:8:1:c2FsdA:!!!!"])("rejects the malformed hash %s", async (hash) => {
    expect(await verifyPassword("anything", hash)).toBe(false);
  });
});

describe("creation code", () => {
  it("is disabled when no hash is configured", async () => {
    expect(await checkCreationCode("anything", "")).toBe("disabled");
  });

  it("accepts the configured code only", async () => {
    const hash = await hashPassword("codigo-del-grupo");
    expect(await checkCreationCode("codigo-del-grupo", hash)).toBe("accepted");
    expect(await checkCreationCode("otro-codigo", hash)).toBe("rejected");
  });
});
