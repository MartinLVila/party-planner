import { and, asc, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { activeRunId, type AnyDatabase, type Transaction } from "../catalog/runs";
import {
  classes,
  ENCHANT_LEVEL,
  equipmentSlots,
  EXCEED_LEVEL,
  items,
  MEMBER_NAME_LENGTH,
  memberEquipment,
  members,
  memberSkills,
  parties,
  PARTY_NAME_LENGTH,
  partyRevisions,
  ROLES,
  SKILL_LEVEL,
  skills,
} from "../db/schema";
import { defineSlots } from "./slots";
import { loadPartySnapshot, type PartySnapshot } from "./snapshot";

export const MAX_MEMBERS = 24;
export const KEPT_REVISIONS = 20;

const memberName = z.string().trim().min(MEMBER_NAME_LENGTH.min).max(MEMBER_NAME_LENGTH.max);
const memberId = z.uuid();
const positiveId = z.number().int().positive();

export const partyChangeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("renameParty"), name: z.string().trim().min(PARTY_NAME_LENGTH.min).max(PARTY_NAME_LENGTH.max) }),
  z.object({ type: z.literal("addMember"), name: memberName, classId: positiveId, role: z.enum(ROLES) }),
  z.object({
    type: z.literal("updateMember"),
    memberId,
    name: memberName.optional(),
    classId: positiveId.optional(),
    role: z.enum(ROLES).optional(),
  }),
  z.object({ type: z.literal("removeMember"), memberId }),
  z.object({ type: z.literal("moveMember"), memberId, toIndex: z.number().int().min(0).max(MAX_MEMBERS - 1) }),
  z.object({
    type: z.literal("setEquipment"),
    memberId,
    slotPos: positiveId,
    itemId: positiveId,
    enchantLevel: z.number().int().min(ENCHANT_LEVEL.min).max(ENCHANT_LEVEL.max),
    exceedLevel: z.number().int().min(EXCEED_LEVEL.min).max(EXCEED_LEVEL.max),
    acquired: z.boolean(),
  }),
  z.object({ type: z.literal("clearEquipment"), memberId, slotPos: positiveId }),
  z.object({
    type: z.literal("setSkill"),
    memberId,
    skillId: positiveId,
    level: z.number().int().min(0).max(SKILL_LEVEL.max),
    equipped: z.boolean(),
  }),
]);

export type PartyChange = z.infer<typeof partyChangeSchema>;
type ChangeOf<T extends PartyChange["type"]> = Extract<PartyChange, { type: T }>;

export type ChangeRejection = "conflict" | "notFound" | "invalid" | "full";

export class ChangeRejected extends Error {
  constructor(
    readonly reason: ChangeRejection,
    message: string,
  ) {
    super(message);
    this.name = "ChangeRejected";
  }
}

export type ChangeResult =
  | { ok: true; snapshot: PartySnapshot }
  | { ok: false; reason: ChangeRejection; snapshot: PartySnapshot | null };

const reject = (reason: ChangeRejection, message: string): never => {
  throw new ChangeRejected(reason, message);
};

async function memberOf(tx: Transaction, partyId: string, id: string) {
  const [member] = await tx
    .select({ id: members.id, classId: members.classId })
    .from(members)
    .where(and(eq(members.id, id), eq(members.partyId, partyId)));
  return member ?? reject("notFound", `member ${id} is not in party ${partyId}`);
}

async function requireActiveRun(tx: Transaction, kind: "classes" | "items" | "character_sample") {
  return (await activeRunId(tx, kind)) ?? reject("invalid", `the ${kind} catalog has not been synced`);
}

async function assertClassExists(tx: Transaction, classId: number) {
  const run = await requireActiveRun(tx, "classes");
  const [row] = await tx
    .select({ id: classes.id })
    .from(classes)
    .where(and(eq(classes.runId, run), eq(classes.id, classId)));
  if (!row) reject("invalid", `class ${classId} is not in the catalog`);
}

async function orderedMemberIds(tx: Transaction, partyId: string): Promise<string[]> {
  const rows = await tx
    .select({ id: members.id })
    .from(members)
    .where(eq(members.partyId, partyId))
    .orderBy(asc(members.position));
  return rows.map((row) => row.id);
}

async function writePositions(tx: Transaction, ids: readonly string[]) {
  for (const [position, id] of ids.entries()) {
    await tx.update(members).set({ position }).where(eq(members.id, id));
  }
}

async function renameParty(tx: Transaction, partyId: string, change: ChangeOf<"renameParty">) {
  await tx.update(parties).set({ name: change.name }).where(eq(parties.id, partyId));
}

async function addMember(tx: Transaction, partyId: string, change: ChangeOf<"addMember">) {
  const ids = await orderedMemberIds(tx, partyId);
  if (ids.length >= MAX_MEMBERS) reject("full", `party ${partyId} already has ${MAX_MEMBERS} members`);
  await assertClassExists(tx, change.classId);
  await tx
    .insert(members)
    .values({ partyId, position: ids.length, name: change.name, classId: change.classId, role: change.role });
}

async function updateMember(tx: Transaction, partyId: string, change: ChangeOf<"updateMember">) {
  const member = await memberOf(tx, partyId, change.memberId);
  const classChanged = change.classId !== undefined && change.classId !== member.classId;
  if (classChanged) await assertClassExists(tx, change.classId as number);

  const updates = { name: change.name, classId: change.classId, role: change.role };
  const defined = Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined));
  if (Object.keys(defined).length === 0) reject("invalid", "updateMember changes nothing");

  await tx.update(members).set(defined).where(eq(members.id, member.id));
  if (classChanged) await tx.delete(memberSkills).where(eq(memberSkills.memberId, member.id));
}

async function removeMember(tx: Transaction, partyId: string, change: ChangeOf<"removeMember">) {
  const member = await memberOf(tx, partyId, change.memberId);
  await tx.delete(members).where(eq(members.id, member.id));
  await writePositions(tx, await orderedMemberIds(tx, partyId));
}

async function moveMember(tx: Transaction, partyId: string, change: ChangeOf<"moveMember">) {
  const member = await memberOf(tx, partyId, change.memberId);
  const ids = (await orderedMemberIds(tx, partyId)).filter((id) => id !== member.id);
  ids.splice(Math.min(change.toIndex, ids.length), 0, member.id);
  await writePositions(tx, ids);
}

async function slotCategories(tx: Transaction, slotPos: number): Promise<readonly string[]> {
  const run = await requireActiveRun(tx, "character_sample");
  const observed = await tx
    .select({ slotPos: equipmentSlots.slotPos, slotPosName: equipmentSlots.slotPosName })
    .from(equipmentSlots)
    .where(eq(equipmentSlots.runId, run));
  const slot = defineSlots(observed).find((candidate) => candidate.slotPos === slotPos);
  return slot?.categories ?? reject("invalid", `slot ${slotPos} does not exist`);
}

async function setEquipment(tx: Transaction, partyId: string, change: ChangeOf<"setEquipment">) {
  const member = await memberOf(tx, partyId, change.memberId);
  const categories = await slotCategories(tx, change.slotPos);
  const run = await requireActiveRun(tx, "items");
  const [item] = await tx
    .select({ categoryName: items.categoryName })
    .from(items)
    .where(and(eq(items.runId, run), eq(items.id, change.itemId)));
  if (!item) reject("invalid", `item ${change.itemId} is not in the catalog`);
  if (!categories.includes(item.categoryName)) {
    reject("invalid", `a ${item.categoryName} does not fit slot ${change.slotPos}`);
  }

  const values = {
    itemId: change.itemId,
    enchantLevel: change.enchantLevel,
    exceedLevel: change.exceedLevel,
    acquired: change.acquired,
  };
  await tx
    .insert(memberEquipment)
    .values({ memberId: member.id, slotPos: change.slotPos, ...values })
    .onConflictDoUpdate({ target: [memberEquipment.memberId, memberEquipment.slotPos], set: values });
}

async function clearEquipment(tx: Transaction, partyId: string, change: ChangeOf<"clearEquipment">) {
  const member = await memberOf(tx, partyId, change.memberId);
  await tx
    .delete(memberEquipment)
    .where(and(eq(memberEquipment.memberId, member.id), eq(memberEquipment.slotPos, change.slotPos)));
}

async function setSkill(tx: Transaction, partyId: string, change: ChangeOf<"setSkill">) {
  const member = await memberOf(tx, partyId, change.memberId);
  const run = await requireActiveRun(tx, "character_sample");
  const [skill] = await tx
    .select({ classId: skills.classId, category: skills.category })
    .from(skills)
    .where(and(eq(skills.runId, run), eq(skills.id, change.skillId)));
  if (!skill || skill.classId !== member.classId) {
    reject("invalid", `skill ${change.skillId} does not belong to class ${member.classId}`);
  }

  const where = and(eq(memberSkills.memberId, member.id), eq(memberSkills.skillId, change.skillId));
  if (change.level === 0) {
    await tx.delete(memberSkills).where(where);
    return;
  }

  const values = { level: change.level, equipped: skill.category !== "Passive" && change.equipped };
  await tx
    .insert(memberSkills)
    .values({ memberId: member.id, skillId: change.skillId, ...values })
    .onConflictDoUpdate({ target: [memberSkills.memberId, memberSkills.skillId], set: values });
}

const HANDLERS: { [T in PartyChange["type"]]: (tx: Transaction, partyId: string, change: ChangeOf<T>) => Promise<void> } =
  { renameParty, addMember, updateMember, removeMember, moveMember, setEquipment, clearEquipment, setSkill };

function runHandler(tx: Transaction, partyId: string, change: PartyChange): Promise<void> {
  const handler = HANDLERS[change.type] as (tx: Transaction, partyId: string, change: PartyChange) => Promise<void>;
  return handler(tx, partyId, change);
}

async function recordRevision(tx: Transaction, partyId: string, now: Date): Promise<PartySnapshot> {
  await tx
    .update(parties)
    .set({ revision: sql`${parties.revision} + 1`, updatedAt: now })
    .where(eq(parties.id, partyId));
  const snapshot = (await loadPartySnapshot(tx, partyId)) as PartySnapshot;
  await tx.insert(partyRevisions).values({ partyId, revision: snapshot.revision, snapshot });
  await tx
    .delete(partyRevisions)
    .where(and(eq(partyRevisions.partyId, partyId), lt(partyRevisions.revision, snapshot.revision - KEPT_REVISIONS + 1)));
  return snapshot;
}

export async function applyPartyChange(
  db: AnyDatabase,
  partyId: string,
  expectedRevision: number,
  change: PartyChange,
  now = new Date(),
): Promise<ChangeResult> {
  try {
    const snapshot = await db.transaction(async (tx) => {
      const [party] = await tx
        .select({ revision: parties.revision })
        .from(parties)
        .where(eq(parties.id, partyId))
        .for("update");
      if (!party) reject("notFound", `party ${partyId} does not exist`);
      if (party.revision !== expectedRevision) {
        reject("conflict", `party ${partyId} is at revision ${party.revision}, not ${expectedRevision}`);
      }
      await runHandler(tx, partyId, change);
      return recordRevision(tx, partyId, now);
    });
    return { ok: true, snapshot };
  } catch (error) {
    if (!(error instanceof ChangeRejected)) throw error;
    return { ok: false, reason: error.reason, snapshot: await loadPartySnapshot(db, partyId) };
  }
}
