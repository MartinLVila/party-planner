"use client";

import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import type { MemberStats } from "@/lib/party/stats";
import type { PartyMember } from "@/lib/party/snapshot";
import { strings } from "@/lib/strings";
import styles from "./party.module.css";

export interface RosterEntry {
  member: PartyMember;
  className: string;
  stats: MemberStats;
}

const KEY_TARGETS: Record<string, (index: number, last: number) => number> = {
  ArrowUp: (index) => index - 1,
  ArrowDown: (index) => index + 1,
  Home: () => 0,
  End: (_index, last) => last,
};

export const abbreviate = (name: string) => name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();

function GearStat({ stats }: { stats: MemberStats }) {
  const complete = stats.slotsMissing === 0;
  return (
    <div>
      <div className={styles.statLabel}>{strings.party.gearLabel}</div>
      <div className={styles.countLine}>
        <span className={styles.statValue}>
          {stats.slotsFilled}/{stats.slotsTotal}
        </span>
        <span className={styles.statNote} data-complete={complete}>
          {complete ? strings.party.gearComplete : strings.party.gearMissing(stats.slotsMissing)}
        </span>
      </div>
      <div className={styles.gearBar} aria-hidden="true">
        <div className={styles.gearAcquired} style={{ flex: `${stats.slotsAcquired} 0 0` }} />
        <div className={styles.gearPlanned} style={{ flex: `${stats.slotsPlanned} 0 0` }} />
        <div style={{ flex: `${stats.slotsMissing} 0 0` }} />
      </div>
    </div>
  );
}

function RemoveButton({ onConfirm }: { onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timeout = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(timeout);
  }, [confirming]);

  return (
    <button
      type="button"
      className={styles.removeButton}
      data-confirming={confirming}
      onClick={() => (confirming ? onConfirm() : setConfirming(true))}
    >
      {confirming ? strings.party.confirmRemove : strings.party.remove}
    </button>
  );
}

interface RowProps {
  entry: RosterEntry;
  index: number;
  total: number;
  canEdit: boolean;
  dragging: boolean;
  drop: "before" | "after" | null;
  onMove: (toIndex: number, fromKeyboard: boolean) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}

function Reorder({ entry, index, total, onMove }: Pick<RowProps, "entry" | "index" | "total" | "onMove">) {
  const { name } = entry.member;

  function onKeyDown(event: KeyboardEvent) {
    const target = KEY_TARGETS[event.key]?.(index, total - 1);
    if (target === undefined || target < 0 || target > total - 1 || target === index) return;
    event.preventDefault();
    onMove(target, true);
  }

  return (
    <div className={styles.handleGroup}>
      <button
        type="button"
        className={styles.handle}
        data-handle={entry.member.id}
        aria-label={strings.party.handleLabel(name, index + 1, total)}
        onKeyDown={onKeyDown}
      >
        ⋮⋮
      </button>
      <div className={styles.arrows}>
        <button
          type="button"
          className={styles.arrow}
          aria-label={strings.party.moveUp(name)}
          disabled={index === 0}
          onClick={() => onMove(index - 1, false)}
        >
          ▲
        </button>
        <button
          type="button"
          className={styles.arrow}
          aria-label={strings.party.moveDown(name)}
          disabled={index === total - 1}
          onClick={() => onMove(index + 1, false)}
        >
          ▼
        </button>
      </div>
      <span className={styles.position}>{index + 1}</span>
    </div>
  );
}

function RosterRow(props: RowProps) {
  const { entry, index, canEdit, dragging, drop, onRemove } = props;
  const { member, stats } = entry;

  const dragHandlers = canEdit
    ? {
        draggable: true,
        onDragStart: (event: DragEvent) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", member.id);
          props.onDragStart();
        },
        onDragOver: (event: DragEvent) => {
          event.preventDefault();
          props.onDragOver();
        },
        onDrop: (event: DragEvent) => {
          event.preventDefault();
          props.onDrop();
        },
        onDragEnd: props.onDragEnd,
      }
    : {};

  return (
    <li className={styles.row} data-dragging={dragging} data-drop={drop ?? undefined} {...dragHandlers}>
      {canEdit ? <Reorder {...props} /> : <span className={styles.position}>{index + 1}</span>}
      <div className={styles.identity}>
        <div className={styles.avatar} aria-hidden="true">
          {abbreviate(entry.className)}
        </div>
        <div className={styles.identityText}>
          <div className={styles.memberName}>{member.name}</div>
          <div className={styles.memberMeta}>
            <span>{entry.className}</span>
            <span className={styles.rolePill}>{member.role}</span>
          </div>
        </div>
      </div>
      <div className={styles.stats}>
        <GearStat stats={stats} />
        <div>
          <div className={styles.statLabel}>{strings.party.averageEnchantLabel}</div>
          <div className={styles.statValue}>
            {stats.averageEnchant === null ? "—" : `+${stats.averageEnchant.toFixed(1)}`}
          </div>
        </div>
        <div>
          <div className={styles.statLabel}>{strings.party.skillsLabel}</div>
          <div className={styles.statValue}>
            {stats.skillsPlanned}/{stats.skillsTotal}
          </div>
        </div>
      </div>
      {canEdit && (
        <div className={styles.rowActions}>
          <RemoveButton onConfirm={onRemove} />
        </div>
      )}
    </li>
  );
}

export function Roster({
  entries,
  canEdit,
  onMove,
  onRemove,
}: {
  entries: readonly RosterEntry[];
  canEdit: boolean;
  onMove: (memberId: string, toIndex: number) => void;
  onRemove: (memberId: string) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const focusAfterMove = useRef<string | null>(null);

  useEffect(() => {
    if (!focusAfterMove.current) return;
    document.querySelector<HTMLElement>(`[data-handle="${focusAfterMove.current}"]`)?.focus();
    focusAfterMove.current = null;
  });

  const endDrag = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

  const dropMarker = (index: number) => {
    if (dragIndex === null || overIndex !== index || dragIndex === index) return null;
    return dragIndex < index ? "after" : "before";
  };

  return (
    <>
      {canEdit && <p className={styles.faint}>{strings.party.reorderHint}</p>}
      <ol aria-label={strings.party.rosterLabel} className={styles.roster}>
        {entries.map((entry, index) => (
          <RosterRow
            key={entry.member.id}
            entry={entry}
            index={index}
            total={entries.length}
            canEdit={canEdit}
            dragging={dragIndex === index}
            drop={dropMarker(index)}
            onMove={(toIndex, fromKeyboard) => {
              if (fromKeyboard) focusAfterMove.current = entry.member.id;
              onMove(entry.member.id, toIndex);
            }}
            onRemove={() => onRemove(entry.member.id)}
            onDragStart={() => setDragIndex(index)}
            onDragOver={() => setOverIndex(index)}
            onDrop={() => {
              const dragged = dragIndex === null ? null : entries[dragIndex];
              if (dragged && dragIndex !== index) onMove(dragged.member.id, index);
              endDrag();
            }}
            onDragEnd={endDrag}
          />
        ))}
      </ol>
    </>
  );
}
