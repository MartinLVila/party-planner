import { ROLES, type Role } from "../db/schema";
import type { CatalogSkill } from "./catalog";
import { hasCatalog, type SlotDefinition } from "./slots";
import type { PartyMember } from "./snapshot";

export interface MemberStats {
  slotsTotal: number;
  slotsFilled: number;
  slotsAcquired: number;
  slotsPlanned: number;
  slotsMissing: number;
  averageEnchant: number | null;
  skillsTotal: number;
  skillsPlanned: number;
  skillsEquipped: number;
  plannedLevels: number;
}

export function memberStats(
  member: PartyMember,
  slots: readonly SlotDefinition[],
  classSkills: readonly CatalogSkill[],
): MemberStats {
  const catalogued = new Set(slots.filter(hasCatalog).map((slot) => slot.slotPos));
  const filled = member.equipment.filter((entry) => catalogued.has(entry.slotPos));
  const acquired = filled.filter((entry) => entry.acquired).length;
  const enchantSum = filled.reduce((sum, entry) => sum + entry.enchantLevel, 0);

  const classSkillIds = new Set(classSkills.map((skill) => skill.id));
  const planned = member.skills.filter((skill) => classSkillIds.has(skill.skillId));

  return {
    slotsTotal: catalogued.size,
    slotsFilled: filled.length,
    slotsAcquired: acquired,
    slotsPlanned: filled.length - acquired,
    slotsMissing: catalogued.size - filled.length,
    averageEnchant: filled.length ? enchantSum / filled.length : null,
    skillsTotal: classSkills.length,
    skillsPlanned: planned.length,
    skillsEquipped: planned.filter((skill) => skill.equipped).length,
    plannedLevels: planned.reduce((sum, skill) => sum + skill.level, 0),
  };
}

export type Composition = Record<Role, number>;

export function composition(members: readonly Pick<PartyMember, "role">[]): Composition {
  const counts = Object.fromEntries(ROLES.map((role) => [role, 0])) as Composition;
  for (const member of members) counts[member.role] += 1;
  return counts;
}

export function missingRoles(counts: Composition): Role[] {
  return ROLES.filter((role) => counts[role] === 0);
}

export function moveInList<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
  return next;
}
