import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { memberEquipment, members, memberSkills, parties } from "../src/lib/db/schema";
import { createTestDatabase, type TestDatabase } from "./helpers/database";

let db: TestDatabase;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
});

afterAll(async () => {
  await close();
});

async function insertParty(name = "Raid del jueves") {
  const [party] = await db
    .insert(parties)
    .values({
      name,
      editTokenHash: randomBytes(32),
      viewTokenHash: randomBytes(32),
      passwordHash: "scrypt$placeholder",
    })
    .returning();
  return party;
}

async function insertMember(partyId: string, position: number, name = "Kaelen") {
  const [member] = await db
    .insert(members)
    .values({ partyId, position, name, classId: 1, role: "Tank" })
    .returning();
  return member;
}

async function rejects(write: Promise<unknown>, constraint: string) {
  const error = await write.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error, `expected ${constraint} to reject the write`).not.toBeNull();
  const cause = (error as { cause?: { constraint?: string } }).cause;
  expect(cause?.constraint).toBe(constraint);
}

describe("party names", () => {
  it("accepts a name within bounds", async () => {
    const party = await insertParty("x".repeat(80));
    expect(party.name).toHaveLength(80);
  });

  it("rejects an empty name", async () => {
    await rejects(insertParty(""), "parties_name_length");
  });

  it("rejects a name over 80 characters", async () => {
    await rejects(insertParty("x".repeat(81)), "parties_name_length");
  });
});

describe("members", () => {
  it("rejects a role outside Tank, Healer, DPS and Support", async () => {
    const party = await insertParty();
    await rejects(
      db.insert(members).values({ partyId: party.id, position: 0, name: "Voss", classId: 1, role: "Bard" as "DPS" }),
      "members_role",
    );
  });

  it("rejects two members in the same position of one party", async () => {
    const party = await insertParty();
    await insertMember(party.id, 0, "Kaelen");
    await rejects(insertMember(party.id, 0, "Mirelle"), "members_party_position");
  });

  it("allows the same position in different parties", async () => {
    const first = await insertParty();
    const second = await insertParty();
    await insertMember(first.id, 0);
    const member = await insertMember(second.id, 0);
    expect(member.position).toBe(0);
  });

  it("rejects a name over 40 characters", async () => {
    const party = await insertParty();
    await rejects(insertMember(party.id, 0, "x".repeat(41)), "members_name_length");
  });
});

describe("equipment levels", () => {
  it.each([0, 20])("accepts enchant level %i", async (enchantLevel) => {
    const party = await insertParty();
    const member = await insertMember(party.id, 0);
    const [row] = await db
      .insert(memberEquipment)
      .values({ memberId: member.id, slotPos: 1, itemId: 110120001, enchantLevel })
      .returning();
    expect(row.enchantLevel).toBe(enchantLevel);
  });

  it.each([-1, 21])("rejects enchant level %i", async (enchantLevel) => {
    const party = await insertParty();
    const member = await insertMember(party.id, 0);
    await rejects(
      db.insert(memberEquipment).values({ memberId: member.id, slotPos: 1, itemId: 110120001, enchantLevel }),
      "member_equipment_enchant_level",
    );
  });

  it.each([-1, 6])("rejects exceed level %i", async (exceedLevel) => {
    const party = await insertParty();
    const member = await insertMember(party.id, 0);
    await rejects(
      db.insert(memberEquipment).values({ memberId: member.id, slotPos: 1, itemId: 110120001, exceedLevel }),
      "member_equipment_exceed_level",
    );
  });
});

describe("skill levels", () => {
  it.each([1, 30])("accepts skill level %i", async (level) => {
    const party = await insertParty();
    const member = await insertMember(party.id, 0);
    const [row] = await db.insert(memberSkills).values({ memberId: member.id, skillId: 17010000, level }).returning();
    expect(row.level).toBe(level);
  });

  it.each([0, 31])("rejects skill level %i", async (level) => {
    const party = await insertParty();
    const member = await insertMember(party.id, 0);
    await rejects(
      db.insert(memberSkills).values({ memberId: member.id, skillId: 17010000, level }),
      "member_skills_level",
    );
  });
});
