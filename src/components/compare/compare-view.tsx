"use client";

import type { CSSProperties, Dispatch, SetStateAction } from "react";
import type { CatalogClass, CatalogGrade, CatalogItem, CatalogSkill } from "@/lib/party/catalog";
import { compareRows, type CompareCell, type CompareRow } from "@/lib/party/compare";
import { gradeColor } from "@/lib/party/grades";
import { SLOT_GROUP_ORDER, type SlotDefinition, type SlotGroupId } from "@/lib/party/slots";
import type { PartyMember } from "@/lib/party/snapshot";
import { memberStats, type MemberStats } from "@/lib/party/stats";
import { strings } from "@/lib/strings";
import { GameIcon } from "../build/game-icon";
import styles from "./compare.module.css";

export interface CompareFilters {
  hidden: ReadonlySet<string>;
  gapsOnly: boolean;
}

export const INITIAL_COMPARE_FILTERS: CompareFilters = { hidden: new Set(), gapsOnly: false };

export interface CompareCatalog {
  classes: CatalogClass[];
  grades: CatalogGrade[];
  slots: SlotDefinition[];
  skills: CatalogSkill[];
}

interface SummaryRow {
  label: string;
  value: (stats: MemberStats) => string;
  warn: (stats: MemberStats) => boolean;
}

const SUMMARY_ROWS: SummaryRow[] = [
  {
    label: strings.compare.gearComplete,
    value: (stats) => `${stats.slotsFilled}/${stats.slotsTotal}`,
    warn: (stats) => stats.slotsMissing > 0,
  },
  { label: strings.compare.acquired, value: (stats) => `${stats.slotsAcquired}/${stats.slotsTotal}`, warn: () => false },
  {
    label: strings.compare.averageEnchant,
    value: (stats) => (stats.averageEnchant === null ? "—" : `+${stats.averageEnchant.toFixed(1)}`),
    warn: () => false,
  },
  { label: strings.compare.skillsPlanned, value: (stats) => `${stats.skillsPlanned}/${stats.skillsTotal}`, warn: () => false },
  { label: strings.compare.skillsOnBar, value: (stats) => String(stats.skillsEquipped), warn: () => false },
];

function Cell({
  cell,
  canEdit,
  gradeNames,
  onOpen,
}: {
  cell: CompareCell;
  canEdit: boolean;
  gradeNames: ReadonlyMap<string, string>;
  onOpen: () => void;
}) {
  if (cell.kind === "empty") {
    return (
      <button type="button" className={styles.emptyCell} onClick={onOpen} disabled={!canEdit}>
        {strings.compare.empty}
      </button>
    );
  }

  const name = cell.item?.name ?? strings.build.unknownItem;
  const flag =
    cell.weakness?.kind === "grade"
      ? strings.compare.belowGrade
      : cell.weakness?.kind === "enchant"
        ? strings.compare.belowAverage(cell.weakness.belowAverage)
        : "";
  const grade = cell.item ? (gradeNames.get(cell.item.gradeId) ?? cell.item.gradeId) : "";

  return (
    <button
      type="button"
      className={styles.cell}
      data-weak={cell.weakness !== null}
      title={`${name} +${cell.enchantLevel}${grade ? ` (${grade})` : ""}`}
      style={{ "--grade-color": cell.item ? gradeColor(cell.item.gradeId) : undefined } as CSSProperties}
      onClick={onOpen}
      disabled={!canEdit}
    >
      <span className={styles.cellIcon}>
        <GameIcon iconPath={cell.item?.iconPath ?? null} size={30} fallback="" />
      </span>
      <span className={styles.cellText}>
        <span className={styles.cellName}>{name}</span>
        <span className={styles.cellMeta}>
          +{cell.enchantLevel}
          {cell.exceedLevel ? ` · Ex${cell.exceedLevel}` : ""} <span className={styles.flag}>{flag}</span>
        </span>
      </span>
    </button>
  );
}

function GroupRows({
  group,
  rows,
  members,
  canEdit,
  gradeNames,
  onOpenSlot,
}: {
  group: SlotGroupId;
  rows: readonly CompareRow[];
  members: readonly PartyMember[];
  canEdit: boolean;
  gradeNames: ReadonlyMap<string, string>;
  onOpenSlot: (memberId: string, slotPos: number) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <>
      <tr className={styles.groupRow}>
        <th colSpan={members.length + 1} scope="colgroup" className={styles.eyebrow}>
          {strings.build.groups[group]}
        </th>
      </tr>
      {rows.map((row) => (
        <tr key={row.slot.slotPos}>
          <th scope="row" className={styles.rowHeader}>
            <span className={styles.slotName}>{strings.slotLabel(row.slot.slotPosName)}</span>
            {row.gaps > 0 && <span className={styles.slotGaps}>{strings.compare.gaps(row.gaps)}</span>}
          </th>
          {row.cells.map((cell, index) => (
            <td key={members[index].id}>
              <Cell
                cell={cell}
                canEdit={canEdit}
                gradeNames={gradeNames}
                onOpen={() => onOpenSlot(members[index].id, row.slot.slotPos)}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function EmptyState({ hasMembers, onBack }: { hasMembers: boolean; onBack: () => void }) {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyTitle}>
        {hasMembers ? strings.compare.noneSelectedTitle : strings.compare.noMembersTitle}
      </div>
      <div className={styles.note}>{hasMembers ? strings.compare.noneSelectedBody : strings.compare.noMembersBody}</div>
      <button type="button" className={styles.button} onClick={onBack}>
        {strings.compare.goToParty}
      </button>
    </div>
  );
}

export function CompareView({
  members,
  catalog,
  items,
  canEdit,
  onBack,
  onOpenMember,
  onOpenSlot,
  filters,
  onFiltersChange,
}: {
  filters: CompareFilters;
  onFiltersChange: Dispatch<SetStateAction<CompareFilters>>;
  members: readonly PartyMember[];
  catalog: CompareCatalog;
  items: ReadonlyMap<number, CatalogItem>;
  canEdit: boolean;
  onBack: () => void;
  onOpenMember: (memberId: string) => void;
  onOpenSlot: (memberId: string, slotPos: number) => void;
}) {
  const { hidden, gapsOnly } = filters;
  const shown = members.filter((member) => !hidden.has(member.id));
  const gradeNames = new Map(catalog.grades.map((grade) => [grade.id, grade.name]));
  const classNames = new Map(catalog.classes.map((entry) => [entry.id, entry.displayName]));
  const rows = compareRows(shown, catalog.slots, items, catalog.grades).filter((row) => !gapsOnly || row.gaps > 0);
  const stats = shown.map((member) =>
    memberStats(member, catalog.slots, catalog.skills.filter((skill) => skill.classId === member.classId)),
  );

  const toggle = (memberId: string) =>
    onFiltersChange((current) => {
      const next = new Set(current.hidden);
      if (!next.delete(memberId)) next.add(memberId);
      return { ...current, hidden: next };
    });

  return (
    <div className={styles.screen}>
      <div className={styles.top}>
        <div>
          <h1 className={styles.heading}>{strings.compare.heading}</h1>
          <p className={styles.note}>{strings.compare.note}</p>
        </div>
        <button type="button" role="switch" aria-checked={gapsOnly} className={styles.switch} onClick={() => onFiltersChange((current) => ({ ...current, gapsOnly: !current.gapsOnly }))}>
          <span className={styles.track}>
            <span className={styles.knob} />
          </span>
          {strings.compare.gapsOnly}
        </button>
      </div>
      <div className={styles.chips} role="group" aria-label={strings.compare.membersLabel}>
        {members.map((member, index) => (
          <button
            key={member.id}
            type="button"
            className={styles.chip}
            aria-pressed={!hidden.has(member.id)}
            onClick={() => toggle(member.id)}
          >
            {index + 1}. {member.name}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <EmptyState hasMembers={members.length > 0} onBack={onBack} />
      ) : (
        <div className={styles.scroller}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col" className={`${styles.rowHeader} ${styles.eyebrow}`}>
                  {strings.compare.slotColumn}
                </th>
                {shown.map((member) => (
                  <th key={member.id} scope="col">
                    <button type="button" className={styles.memberHead} onClick={() => onOpenMember(member.id)}>
                      <span className={styles.memberName}>
                        {members.indexOf(member) + 1}. {member.name}
                      </span>
                      <span className={styles.memberSub}>
                        {classNames.get(member.classId) ?? "—"} · {member.role}
                      </span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!gapsOnly && (
                <>
                  <tr className={styles.groupRow}>
                    <th colSpan={shown.length + 1} scope="colgroup" className={styles.eyebrow}>
                      {strings.compare.summary}
                    </th>
                  </tr>
                  {SUMMARY_ROWS.map((summary) => (
                    <tr key={summary.label}>
                      <th scope="row" className={styles.rowHeader}>
                        <span className={styles.slotName}>{summary.label}</span>
                      </th>
                      {stats.map((memberStat, index) => (
                        <td key={shown[index].id}>
                          <div className={styles.text} data-warn={summary.warn(memberStat)}>
                            {summary.value(memberStat)}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </>
              )}
              {SLOT_GROUP_ORDER.map((group) => (
                <GroupRows
                  key={group}
                  group={group}
                  rows={rows.filter((row) => row.slot.group === group)}
                  members={shown}
                  canEdit={canEdit}
                  gradeNames={gradeNames}
                  onOpenSlot={onOpenSlot}
                />
              ))}
            </tbody>
          </table>
          {gapsOnly && rows.length === 0 && <div className={styles.noGaps}>{strings.compare.noGaps}</div>}
        </div>
      )}
    </div>
  );
}
