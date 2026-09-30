"use client";

import { SKILL_CATEGORIES, SKILL_LEVEL, type SkillCategory } from "@/lib/db/schema";
import type { CatalogSkill } from "@/lib/party/catalog";
import type { MemberSkill } from "@/lib/party/snapshot";
import type { MemberStats } from "@/lib/party/stats";
import { strings } from "@/lib/strings";
import styles from "./build.module.css";
import { GameIcon } from "./game-icon";

export interface SkillPlan {
  skillId: number;
  level: number;
  equipped: boolean;
}

const initials = (name: string) =>
  name
    .split(/[\s:']+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

function EquipToggle({
  skill,
  equipped,
  disabled,
  onToggle,
}: {
  skill: CatalogSkill;
  equipped: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={equipped}
      aria-label={strings.build.equipSkill(skill.name)}
      className={styles.toggle}
      disabled={disabled}
      onClick={onToggle}
    >
      <span className={styles.track}>
        <span className={styles.knob} />
      </span>
      {equipped ? strings.build.onBar : strings.build.offBar}
    </button>
  );
}

function SkillRow({
  skill,
  plan,
  canEdit,
  onChange,
}: {
  skill: CatalogSkill;
  plan: MemberSkill | undefined;
  canEdit: boolean;
  onChange: (plan: SkillPlan) => void;
}) {
  const level = plan?.level ?? 0;
  const equipped = plan?.equipped ?? false;
  const passive = skill.category === "Passive";
  const setLevel = (next: number) => onChange({ skillId: skill.id, level: next, equipped: next > 0 && equipped });

  return (
    <div className={styles.skillRow} data-planned={level > 0} data-equipped={equipped}>
      <div className={styles.skillIcon} aria-hidden="true">
        <GameIcon iconPath={skill.iconPath} size={32} fallback={initials(skill.name)} />
      </div>
      <div className={styles.skillText}>
        <div className={styles.skillName}>{skill.name}</div>
        <div className={styles.skillMeta}>
          {strings.build.requiredLevel(skill.requiredLevel)}
          {level === 0 && ` · ${strings.build.notPlanned}`}
        </div>
      </div>
      <div className={styles.stepper}>
        <button
          type="button"
          aria-label={strings.build.lowerSkill(skill.name)}
          disabled={!canEdit || level === 0}
          onClick={() => setLevel(level <= SKILL_LEVEL.min ? 0 : level - 1)}
        >
          −
        </button>
        <span className={styles.stepValue} aria-live="polite">
          {level ? strings.build.levelLabel(level) : "—"}
        </span>
        <button
          type="button"
          aria-label={strings.build.raiseSkill(skill.name)}
          disabled={!canEdit || level >= SKILL_LEVEL.max}
          onClick={() => setLevel(level + 1)}
        >
          +
        </button>
      </div>
      {passive ? (
        <span className={styles.passiveNote}>{strings.build.alwaysActive}</span>
      ) : (
        <EquipToggle
          skill={skill}
          equipped={equipped}
          disabled={!canEdit || level === 0}
          onToggle={() => onChange({ skillId: skill.id, level, equipped: !equipped })}
        />
      )}
    </div>
  );
}

function PointsSummary({ stats }: { stats: MemberStats }) {
  return (
    <>
      <div className={styles.pointsGrid}>
        <div className={styles.pointsCell}>
          <div className={styles.label}>{strings.build.plannedLevels}</div>
          <div className={styles.pointsValue}>{stats.plannedLevels}</div>
        </div>
        <div className={styles.pointsCell} data-unknown="true">
          <div className={styles.label}>{strings.build.pointsNeeded}</div>
          <div className={styles.pointsUnknown}>{strings.build.unknownCost}</div>
        </div>
        <div className={styles.pointsCell} data-unknown="true">
          <div className={styles.label}>{strings.build.pointCap}</div>
          <div className={styles.pointsUnknown}>{strings.build.unknownCap}</div>
        </div>
      </div>
      <div className={styles.note}>{strings.build.pointsNote}</div>
    </>
  );
}

function groupCount(category: SkillCategory, list: readonly CatalogSkill[], plans: ReadonlyMap<number, MemberSkill>) {
  const planned = list.filter((skill) => plans.has(skill.id)).length;
  const equipped = category === "Passive" ? null : list.filter((skill) => plans.get(skill.id)?.equipped).length;
  return strings.build.skillGroupCount(planned, list.length, equipped);
}

export function SkillsPanel({
  skills,
  plans,
  stats,
  canEdit,
  onChange,
}: {
  skills: readonly CatalogSkill[];
  plans: readonly MemberSkill[];
  stats: MemberStats;
  canEdit: boolean;
  onChange: (plan: SkillPlan) => void;
}) {
  const byId = new Map(plans.map((plan) => [plan.skillId, plan]));

  return (
    <section aria-label={strings.build.skillsHeading} className={styles.panel}>
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>{strings.build.skillsHeading}</h2>
        <span className={styles.legend}>
          {strings.build.skillSummary(stats.skillsPlanned, stats.skillsTotal, stats.skillsEquipped)}
        </span>
      </div>
      <PointsSummary stats={stats} />
      {skills.length === 0 && <div className={styles.note}>{strings.build.noSkills}</div>}
      {SKILL_CATEGORIES.map((category) => {
        const list = skills.filter((skill) => skill.category === category);
        if (list.length === 0) return null;
        return (
          <div key={category} className={styles.group}>
            <div className={styles.groupHeader}>
              <span>{strings.build.skillGroups[category]}</span>
              <span>{groupCount(category, list, byId)}</span>
            </div>
            {list.map((skill) => (
              <SkillRow key={skill.id} skill={skill} plan={byId.get(skill.id)} canEdit={canEdit} onChange={onChange} />
            ))}
          </div>
        );
      })}
    </section>
  );
}
