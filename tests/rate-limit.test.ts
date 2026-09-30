import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { forgetAttempts, rateLimitKey, takeAttempt, type RateLimit } from "../src/lib/access/rate-limit";
import { createTestDatabase, type TestDatabase } from "./helpers/database";

let db: TestDatabase;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
});

afterAll(async () => {
  await close();
});

const limit: RateLimit = { name: "test", maxAttempts: 3, windowMs: 60_000 };

async function attempts(subject: string, count: number, now: Date) {
  const results = [];
  for (let attempt = 0; attempt < count; attempt += 1) results.push(await takeAttempt(db, limit, subject, now));
  return results;
}

describe("rate limit", () => {
  it("allows the configured attempts and refuses the rest", async () => {
    expect(await attempts("198.51.100.1", 5, new Date())).toEqual([true, true, true, false, false]);
  });

  it("counts each subject separately", async () => {
    const now = new Date();
    await attempts("198.51.100.2", 3, now);
    expect(await takeAttempt(db, limit, "198.51.100.3", now)).toBe(true);
  });

  it("starts over once the window has passed", async () => {
    const now = new Date();
    await attempts("198.51.100.4", 4, now);
    expect(await takeAttempt(db, limit, "198.51.100.4", new Date(now.getTime() + 61_000))).toBe(true);
  });

  it("starts over when the attempts are forgiven", async () => {
    const now = new Date();
    await attempts("198.51.100.5", 3, now);
    await forgetAttempts(db, limit, "198.51.100.5");
    expect(await takeAttempt(db, limit, "198.51.100.5", now)).toBe(true);
  });

  it("stores a hash of the subject, not the subject", () => {
    expect(rateLimitKey(limit, "198.51.100.6")).not.toContain("198.51.100.6");
  });
});
