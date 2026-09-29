import { asc, eq, inArray } from "drizzle-orm";
import type { AnyDatabase, Transaction } from "../catalog/runs";
import { memberEquipment, members, memberSkills, parties, type Role } from "../db/schema";

export interface MemberEquipment {
  slotPos: number;
  itemId: number;
  enchantLevel: number;
  exceedLevel: number;
  acquired: boolean;
}

export interface MemberSkill {
  skillId: number;
  level: number;
  equipped: boolean;
}

export interface PartyMember {
  id: string;
  name: string;
  classId: number;
  role: Role;
  equipment: MemberEquipment[];
  skills: MemberSkill[];
}

export interface PartySnapshot {
  id: string;
  name: string;
  revision: number;
  updatedAt: string;
  members: PartyMember[];
}

export async function loadPartySnapshot(db: AnyDatabase | Transaction, partyId: string): Promise<PartySnapshot | null> {
  const [party] = await db
    .select({ id: parties.id, name: parties.name, revision: parties.revision, updatedAt: parties.updatedAt })
    .from(parties)
    .where(eq(parties.id, partyId));
  if (!party) return null;

  const memberRows = await db
    .select({ id: members.id, name: members.name, classId: members.classId, role: members.role })
    .from(members)
    .where(eq(members.partyId, partyId))
    .orderBy(asc(members.position));
  const memberIds = memberRows.map((member) => member.id);

  const [equipmentRows, skillRows] =
    memberIds.length === 0
      ? [[], []]
      : await Promise.all([
          db
            .select()
            .from(memberEquipment)
            .where(inArray(memberEquipment.memberId, memberIds))
            .orderBy(asc(memberEquipment.slotPos)),
          db.select().from(memberSkills).where(inArray(memberSkills.memberId, memberIds)).orderBy(asc(memberSkills.skillId)),
        ]);

  return {
    id: party.id,
    name: party.name,
    revision: party.revision,
    updatedAt: party.updatedAt.toISOString(),
    members: memberRows.map((member) => ({
      ...member,
      equipment: equipmentRows
        .filter((row) => row.memberId === member.id)
        .map(({ slotPos, itemId, enchantLevel, exceedLevel, acquired }) => ({
          slotPos,
          itemId,
          enchantLevel,
          exceedLevel,
          acquired,
        })),
      skills: skillRows
        .filter((row) => row.memberId === member.id)
        .map(({ skillId, level, equipped }) => ({ skillId, level, equipped })),
    })),
  };
}
