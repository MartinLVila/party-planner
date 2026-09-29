"use client";

import { useState } from "react";
import { MEMBER_NAME_LENGTH, ROLES, type Role } from "@/lib/db/schema";
import type { CatalogClass } from "@/lib/party/catalog";
import type { PartyMember } from "@/lib/party/snapshot";
import type { MemberStats } from "@/lib/party/stats";
import { strings } from "@/lib/strings";
import { abbreviate } from "../party/roster";
import styles from "./build.module.css";

export interface MemberUpdate {
  name?: string;
  classId?: number;
  role?: Role;
}

function MemberName({ name, canEdit, onRename }: { name: string; canEdit: boolean; onRename: (name: string) => void }) {
  const [draft, setDraft] = useState(name);
  const [source, setSource] = useState(name);
  if (source !== name) {
    setSource(name);
    setDraft(name);
  }

  if (!canEdit) return <span className={styles.nameStatic}>{name}</span>;

  function commit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) onRename(trimmed);
    else setDraft(name);
  }

  return (
    <input
      aria-label={strings.build.memberNameLabel}
      className={styles.nameInput}
      value={draft}
      maxLength={MEMBER_NAME_LENGTH.max}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}

function Readiness({ stats }: { stats: MemberStats }) {
  const cells = [
    {
      label: strings.build.readinessGear,
      value: `${stats.slotsFilled}/${stats.slotsTotal}`,
      warn: stats.slotsMissing > 0,
    },
    { label: strings.build.readinessAcquired, value: `${stats.slotsAcquired}/${stats.slotsTotal}`, warn: false },
    {
      label: strings.build.readinessEnchant,
      value: stats.averageEnchant === null ? "—" : `+${stats.averageEnchant.toFixed(1)}`,
      warn: false,
    },
    { label: strings.build.readinessSkills, value: `${stats.skillsPlanned}/${stats.skillsTotal}`, warn: false },
  ];
  return (
    <div className={styles.readiness}>
      {cells.map((cell) => (
        <div key={cell.label}>
          <div className={styles.label}>{cell.label}</div>
          <div className={styles.value} data-warn={cell.warn}>
            {cell.value}
          </div>
        </div>
      ))}
    </div>
  );
}

export function BuildHeader({
  member,
  position,
  classes,
  stats,
  canEdit,
  onUpdate,
}: {
  member: PartyMember;
  position: number;
  classes: readonly CatalogClass[];
  stats: MemberStats;
  canEdit: boolean;
  onUpdate: (update: MemberUpdate) => void;
}) {
  const memberClass = classes.find((entry) => entry.id === member.classId);

  return (
    <div className={styles.headerCard}>
      <div className={styles.identity}>
        <div className={styles.bigAvatar} aria-hidden="true">
          {abbreviate(memberClass?.displayName ?? "")}
        </div>
        <div className={styles.identityFields}>
          <div className={styles.nameRow}>
            <span className={styles.positionLabel}>#{position}</span>
            <MemberName name={member.name} canEdit={canEdit} onRename={(name) => onUpdate({ name })} />
          </div>
          <div className={styles.selects}>
            <select
              aria-label={strings.build.classLabel}
              className={styles.select}
              value={member.classId}
              disabled={!canEdit}
              onChange={(event) => onUpdate({ classId: Number(event.target.value) })}
            >
              {classes.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.displayName}
                </option>
              ))}
            </select>
            <select
              aria-label={strings.build.roleLabel}
              className={styles.select}
              value={member.role}
              disabled={!canEdit}
              onChange={(event) => onUpdate({ role: event.target.value as Role })}
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <Readiness stats={stats} />
      <div className={styles.importBox}>
        <button type="button" className={styles.importButton} disabled aria-describedby="import-note">
          {strings.build.importCharacter}
        </button>
        <span id="import-note" className={styles.importNote}>
          {strings.build.importUnavailable}
        </span>
      </div>
    </div>
  );
}
