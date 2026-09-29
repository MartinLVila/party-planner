"use client";

import type { CSSProperties } from "react";
import type { CatalogItem } from "@/lib/party/catalog";
import { gradeColor } from "@/lib/party/grades";
import { hasCatalog, SLOT_GROUP_ORDER, type SlotDefinition } from "@/lib/party/slots";
import type { MemberEquipment } from "@/lib/party/snapshot";
import type { MemberStats } from "@/lib/party/stats";
import { strings } from "@/lib/strings";
import styles from "./build.module.css";
import { GameIcon } from "./game-icon";

interface SlotView {
  state: "filled" | "empty" | "unavailable";
  name: string;
  meta: string;
  aria: string;
  item: CatalogItem | null;
  equipment: MemberEquipment | null;
}

const withGrade = (gradeId: string | undefined) =>
  ({ "--grade-color": gradeId ? gradeColor(gradeId) : undefined }) as CSSProperties;

export function gradeName(gradeId: string, grades: ReadonlyMap<string, string>): string {
  return grades.get(gradeId) ?? gradeId;
}

function describeSlot(
  slot: SlotDefinition,
  equipment: MemberEquipment | undefined,
  items: ReadonlyMap<number, CatalogItem>,
  grades: ReadonlyMap<string, string>,
): SlotView {
  const label = strings.slotLabel(slot.slotPosName);
  if (!hasCatalog(slot)) {
    return {
      state: "unavailable",
      name: strings.build.noCatalog,
      meta: strings.build.noCatalogHint,
      aria: strings.build.slotAria(label, strings.build.noCatalog),
      item: null,
      equipment: null,
    };
  }
  if (!equipment) {
    return {
      state: "empty",
      name: strings.build.emptySlot,
      meta: strings.build.emptySlotHint,
      aria: strings.build.slotAria(label, `${strings.build.emptySlot}. ${strings.build.emptySlotHint}`),
      item: null,
      equipment: null,
    };
  }
  const item = items.get(equipment.itemId) ?? null;
  const name = item?.name ?? strings.build.unknownItem;
  const meta = [item && gradeName(item.gradeId, grades), item?.categoryName, equipment.exceedLevel ? strings.build.exceed(equipment.exceedLevel) : null]
    .filter(Boolean)
    .join(" · ");
  const status = equipment.acquired ? strings.build.acquired : strings.build.planned;
  return {
    state: "filled",
    name,
    meta,
    aria: strings.build.slotAria(label, `${name} +${equipment.enchantLevel}, ${status}`),
    item,
    equipment,
  };
}

function SlotButton({
  slot,
  view,
  canEdit,
  onOpen,
}: {
  slot: SlotDefinition;
  view: SlotView;
  canEdit: boolean;
  onOpen: () => void;
}) {
  const acquired = view.equipment?.acquired;
  return (
    <button
      type="button"
      className={styles.slot}
      data-state={view.state}
      disabled={!canEdit || view.state === "unavailable"}
      aria-label={view.aria}
      onClick={onOpen}
      style={withGrade(view.item?.gradeId)}
    >
      <span className={styles.slotIcon}>
        <GameIcon iconPath={view.item?.iconPath ?? null} size={42} fallback="" />
        {view.equipment && <span className={styles.enchantBadge}>+{view.equipment.enchantLevel}</span>}
      </span>
      <span className={styles.slotText}>
        <span className={styles.slotTop}>
          <span className={styles.slotLabel}>{strings.slotLabel(slot.slotPosName)}</span>
          {view.equipment && <span className={styles.dot} data-kind={acquired ? "acquired" : "planned"} />}
        </span>
        <span className={styles.slotName}>{view.name}</span>
        <span className={styles.slotMeta}>{view.meta}</span>
      </span>
    </button>
  );
}

export function EquipmentPanel({
  slots,
  equipment,
  items,
  grades,
  stats,
  canEdit,
  onOpenSlot,
}: {
  slots: readonly SlotDefinition[];
  equipment: readonly MemberEquipment[];
  items: ReadonlyMap<number, CatalogItem>;
  grades: ReadonlyMap<string, string>;
  stats: MemberStats;
  canEdit: boolean;
  onOpenSlot: (slot: SlotDefinition) => void;
}) {
  const bySlot = new Map(equipment.map((entry) => [entry.slotPos, entry]));

  return (
    <section aria-label={strings.build.equipmentHeading} className={styles.panel}>
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>{strings.build.equipmentHeading}</h2>
        <div className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={styles.dot} data-kind="acquired" />
            {strings.build.acquiredLegend(stats.slotsAcquired)}
          </span>
          <span className={styles.legendItem}>
            <span className={styles.dot} data-kind="planned" />
            {strings.build.plannedLegend(stats.slotsPlanned)}
          </span>
          <span className={styles.legendItem}>
            <span className={styles.dot} data-kind="missing" />
            {strings.build.missingLegend(stats.slotsMissing)}
          </span>
        </div>
      </div>
      {SLOT_GROUP_ORDER.map((group) => {
        const groupSlots = slots.filter((slot) => slot.group === group);
        if (groupSlots.length === 0) return null;
        const catalogued = groupSlots.filter(hasCatalog);
        const filled = catalogued.filter((slot) => bySlot.has(slot.slotPos)).length;
        return (
          <div key={group} className={styles.group}>
            <div className={styles.groupHeader}>
              <span>{strings.build.groups[group]}</span>
              <span>{catalogued.length ? `${filled}/${catalogued.length}` : "—"}</span>
            </div>
            <div className={styles.slotGrid}>
              {groupSlots.map((slot) => (
                <SlotButton
                  key={slot.slotPos}
                  slot={slot}
                  view={describeSlot(slot, bySlot.get(slot.slotPos), items, grades)}
                  canEdit={canEdit}
                  onOpen={() => onOpenSlot(slot)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
