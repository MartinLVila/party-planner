import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createParty } from "../src/lib/access/party-access";
import { partyRevisions } from "../src/lib/db/schema";
import { applyPartyChange, KEPT_REVISIONS, MAX_MEMBERS, type PartyChange } from "../src/lib/party/changes";
import { loadPartySnapshot, type PartySnapshot } from "../src/lib/party/snapshot";
import {
  GLADIATOR,
  GLADIATOR_ACTIVE_SKILL,
  GLADIATOR_PASSIVE_SKILL,
  GREATSWORD,
  MAIN_HAND,
  PET_SLOT,
  RING,
  seedCatalog,
  TEMPLAR,
  TEMPLAR_ACTIVE_SKILL,
  WING_SLOT,
  WINGS,
} from "./helpers/catalog-fixture";
import { createTestDatabase, type TestDatabase } from "./helpers/database";

let db: TestDatabase;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
  await seedCatalog(db);
});

afterAll(async () => {
  await close();
});

async function newParty(): Promise<PartySnapshot> {
  const { partyId } = await createParty(db, { name: "Raid del jueves", password: "clave-de-prueba" });
  return (await loadPartySnapshot(db, partyId)) as PartySnapshot;
}

async function apply(party: PartySnapshot, change: PartyChange): Promise<PartySnapshot> {
  const result = await applyPartyChange(db, party.id, party.revision, change);
  if (!result.ok) throw new Error(`expected ${change.type} to succeed, got ${result.reason}`);
  return result.snapshot;
}

async function rejection(party: PartySnapshot, change: PartyChange) {
  const result = await applyPartyChange(db, party.id, party.revision, change);
  return result.ok ? null : result.reason;
}

async function withMembers(...names: string[]): Promise<PartySnapshot> {
  let party = await newParty();
  for (const name of names) party = await apply(party, { type: "addMember", name, classId: GLADIATOR, role: "DPS" });
  return party;
}

const namesOf = (party: PartySnapshot) => party.members.map((member) => member.name);

describe("revisions", () => {
  it("bumps the revision and records a snapshot on every change", async () => {
    const party = await newParty();
    const renamed = await apply(party, { type: "renameParty", name: "Raid del viernes" });

    expect(renamed.revision).toBe(party.revision + 1);
    const [stored] = await db.select().from(partyRevisions).where(eq(partyRevisions.partyId, party.id));
    expect(stored).toMatchObject({ revision: renamed.revision, snapshot: { name: "Raid del viernes" } });
  });

  it("refuses a change based on a stale revision and returns the current state", async () => {
    const party = await newParty();
    await apply(party, { type: "renameParty", name: "Otro nombre" });

    const result = await applyPartyChange(db, party.id, party.revision, { type: "renameParty", name: "Pisado" });

    expect(result).toMatchObject({ ok: false, reason: "conflict", snapshot: { name: "Otro nombre" } });
  });

  it(`keeps only the last ${KEPT_REVISIONS} snapshots`, async () => {
    let party = await newParty();
    for (let round = 0; round < KEPT_REVISIONS + 5; round += 1) {
      party = await apply(party, { type: "renameParty", name: `Nombre ${round}` });
    }
    const stored = await db.select().from(partyRevisions).where(eq(partyRevisions.partyId, party.id));
    expect(stored).toHaveLength(KEPT_REVISIONS);
    expect(Math.min(...stored.map((row) => row.revision))).toBe(party.revision - KEPT_REVISIONS + 1);
  });
});

describe("members", () => {
  it("adds members in order", async () => {
    expect(namesOf(await withMembers("Kaelen", "Mirelle", "Voss"))).toEqual(["Kaelen", "Mirelle", "Voss"]);
  });

  it("refuses a class that is not in the catalog", async () => {
    const party = await newParty();
    expect(await rejection(party, { type: "addMember", name: "Nadie", classId: 999, role: "DPS" })).toBe("invalid");
  });

  it(`refuses a member beyond ${MAX_MEMBERS}`, async () => {
    const party = await withMembers(...Array.from({ length: MAX_MEMBERS }, (_, index) => `Miembro ${index}`));
    expect(await rejection(party, { type: "addMember", name: "Uno más", classId: GLADIATOR, role: "DPS" })).toBe("full");
  });

  it("moves a member and keeps the rest in order", async () => {
    const party = await withMembers("Kaelen", "Mirelle", "Voss", "Sable");
    const voss = party.members[2];

    const toFront = await apply(party, { type: "moveMember", memberId: voss.id, toIndex: 0 });
    const toBack = await apply(toFront, { type: "moveMember", memberId: voss.id, toIndex: 3 });

    expect(namesOf(toFront)).toEqual(["Voss", "Kaelen", "Mirelle", "Sable"]);
    expect(namesOf(toBack)).toEqual(["Kaelen", "Mirelle", "Sable", "Voss"]);
  });

  it("closes the gap when a member is removed", async () => {
    const party = await withMembers("Kaelen", "Mirelle", "Voss");
    const removed = await apply(party, { type: "removeMember", memberId: party.members[0].id });
    const moved = await apply(removed, { type: "moveMember", memberId: removed.members[1].id, toIndex: 0 });
    expect(namesOf(moved)).toEqual(["Voss", "Mirelle"]);
  });

  it("adds after a removal without colliding with an existing position", async () => {
    const party = await withMembers("Kaelen", "Mirelle", "Voss");
    const removed = await apply(party, { type: "removeMember", memberId: party.members[0].id });
    const added = await apply(removed, { type: "addMember", name: "Sable", classId: GLADIATOR, role: "DPS" });
    expect(namesOf(added)).toEqual(["Mirelle", "Voss", "Sable"]);
  });

  it("drops planned skills when the class changes", async () => {
    let party = await withMembers("Kaelen");
    const member = party.members[0];
    party = await apply(party, {
      type: "setSkill",
      memberId: member.id,
      skillId: GLADIATOR_ACTIVE_SKILL,
      level: 10,
      equipped: true,
    });
    party = await apply(party, { type: "updateMember", memberId: member.id, classId: TEMPLAR, role: "Tank" });

    expect(party.members[0]).toMatchObject({ classId: TEMPLAR, role: "Tank", skills: [] });
  });

  it("refuses to touch a member of another party", async () => {
    const mine = await newParty();
    const theirs = await withMembers("Ajeno");
    expect(await rejection(mine, { type: "removeMember", memberId: theirs.members[0].id })).toBe("notFound");
    expect(namesOf((await loadPartySnapshot(db, theirs.id)) as PartySnapshot)).toEqual(["Ajeno"]);
  });
});

describe("equipment", () => {
  const equip = (memberId: string, slotPos: number, itemId: number): PartyChange => ({
    type: "setEquipment",
    memberId,
    slotPos,
    itemId,
    enchantLevel: 15,
    exceedLevel: 3,
    acquired: true,
  });

  it("puts a catalog item in a slot that takes its category", async () => {
    const party = await withMembers("Kaelen");
    const member = party.members[0];
    const equipped = await apply(party, equip(member.id, MAIN_HAND, GREATSWORD));
    const withWings = await apply(equipped, equip(member.id, WING_SLOT, WINGS));

    expect(withWings.members[0].equipment).toEqual([
      { slotPos: MAIN_HAND, itemId: GREATSWORD, enchantLevel: 15, exceedLevel: 3, acquired: true },
      { slotPos: WING_SLOT, itemId: WINGS, enchantLevel: 15, exceedLevel: 3, acquired: true },
    ]);
  });

  it.each([
    ["an item of another category", MAIN_HAND, RING],
    ["an item that is not in the catalog", MAIN_HAND, 999_999],
    ["a slot that does not exist", 77, GREATSWORD],
    ["a slot without a catalog", PET_SLOT, GREATSWORD],
  ])("refuses %s", async (_label, slotPos, itemId) => {
    const party = await withMembers("Kaelen");
    expect(await rejection(party, equip(party.members[0].id, slotPos, itemId))).toBe("invalid");
  });

  it("empties a slot", async () => {
    const party = await withMembers("Kaelen");
    const member = party.members[0];
    const equipped = await apply(party, equip(member.id, MAIN_HAND, GREATSWORD));
    const cleared = await apply(equipped, { type: "clearEquipment", memberId: member.id, slotPos: MAIN_HAND });
    expect(cleared.members[0].equipment).toEqual([]);
  });
});

describe("skills", () => {
  it("plans a level, never equips a passive, and removes the plan at level 0", async () => {
    let party = await withMembers("Kaelen");
    const memberId = party.members[0].id;

    party = await apply(party, { type: "setSkill", memberId, skillId: GLADIATOR_ACTIVE_SKILL, level: 12, equipped: true });
    party = await apply(party, { type: "setSkill", memberId, skillId: GLADIATOR_PASSIVE_SKILL, level: 5, equipped: true });
    expect(party.members[0].skills).toEqual([
      { skillId: GLADIATOR_ACTIVE_SKILL, level: 12, equipped: true },
      { skillId: GLADIATOR_PASSIVE_SKILL, level: 5, equipped: false },
    ]);

    party = await apply(party, { type: "setSkill", memberId, skillId: GLADIATOR_ACTIVE_SKILL, level: 0, equipped: true });
    expect(party.members[0].skills.map((skill) => skill.skillId)).toEqual([GLADIATOR_PASSIVE_SKILL]);
  });

  it("refuses a skill of another class", async () => {
    const party = await withMembers("Kaelen");
    const change: PartyChange = {
      type: "setSkill",
      memberId: party.members[0].id,
      skillId: TEMPLAR_ACTIVE_SKILL,
      level: 3,
      equipped: false,
    };
    expect(await rejection(party, change)).toBe("invalid");
  });
});
