"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { searchItemsAction, type ItemSearchResult } from "@/app/actions/items";
import { ENCHANT_LEVEL, EXCEED_LEVEL } from "@/lib/db/schema";
import type { CatalogGrade, CatalogItem } from "@/lib/party/catalog";
import { gradeColor } from "@/lib/party/grades";
import type { SlotDefinition } from "@/lib/party/slots";
import type { MemberEquipment } from "@/lib/party/snapshot";
import { strings } from "@/lib/strings";
import { GameIcon } from "./game-icon";
import styles from "./picker.module.css";

export interface PickedEquipment {
  item: CatalogItem;
  enchantLevel: number;
  exceedLevel: number;
  acquired: boolean;
}

interface Filters {
  query: string;
  category: string | null;
  gradeIds: string[];
}

type SearchState = { status: "loading" } | ItemSearchResult;

const EMPTY_FILTERS: Filters = { query: "", category: null, gradeIds: [] };
const SEARCH_DELAY_MS = 250;
const EXCEED_OPTIONS = Array.from({ length: EXCEED_LEVEL.max + 1 }, (_, level) => level);

const gradeStyle = (gradeId: string) => ({ "--grade-color": gradeColor(gradeId) }) as CSSProperties;

function useItemSearch(partyId: string, slotPos: number, filters: Filters, attempt: number): SearchState {
  const [state, setState] = useState<{ key: string; result: SearchState }>({ key: "", result: { status: "loading" } });
  const key = JSON.stringify([filters, attempt]);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(async () => {
      let result: ItemSearchResult;
      try {
        result = await searchItemsAction({ partyId, slotPos, ...filters });
      } catch {
        result = { ok: false, reason: "failed" };
      }
      if (!cancelled) setState({ key, result });
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [partyId, slotPos, filters, key]);

  return state.key === key ? state.result : { status: "loading" };
}

function Chip({
  pressed,
  onClick,
  children,
  style,
}: {
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
  style?: CSSProperties;
}) {
  return (
    <button type="button" className={styles.chip} aria-pressed={pressed} onClick={onClick} style={style}>
      {children}
    </button>
  );
}

function FilterBar({
  slot,
  grades,
  filters,
  onChange,
  count,
}: {
  slot: SlotDefinition;
  grades: readonly CatalogGrade[];
  filters: Filters;
  onChange: (filters: Filters) => void;
  count: string;
}) {
  const toggleGrade = (id: string) =>
    onChange({
      ...filters,
      gradeIds: filters.gradeIds.includes(id) ? filters.gradeIds.filter((grade) => grade !== id) : [...filters.gradeIds, id],
    });

  return (
    <div className={styles.filters}>
      <input
        type="search"
        className={styles.search}
        value={filters.query}
        maxLength={80}
        placeholder={strings.picker.searchPlaceholder}
        aria-label={strings.picker.searchLabel}
        onChange={(event) => onChange({ ...filters, query: event.target.value })}
        autoFocus
      />
      <div className={styles.chipRow}>
        {slot.categories.length > 1 && (
          <div className={styles.chips} role="group" aria-label={strings.picker.categoryLabel}>
            {[null, ...slot.categories].map((category) => (
              <Chip
                key={category ?? "all"}
                pressed={filters.category === category}
                onClick={() => onChange({ ...filters, category })}
              >
                {category ?? strings.picker.allCategories}
              </Chip>
            ))}
          </div>
        )}
        <div className={styles.chips} role="group" aria-label={strings.picker.gradeLabel}>
          {grades.map((grade) => (
            <Chip
              key={grade.id}
              pressed={filters.gradeIds.includes(grade.id)}
              onClick={() => toggleGrade(grade.id)}
              style={gradeStyle(grade.id)}
            >
              <span className={styles.swatch} />
              {grade.name}
            </Chip>
          ))}
        </div>
        <span className={styles.count}>{count}</span>
      </div>
    </div>
  );
}

function ResultList({
  search,
  filters,
  selectedId,
  currentItemId,
  gradeNames,
  onSelect,
  onRetry,
  onClear,
}: {
  search: SearchState;
  filters: Filters;
  selectedId: number | null;
  currentItemId: number | null;
  gradeNames: ReadonlyMap<string, string>;
  onSelect: (item: CatalogItem) => void;
  onRetry: () => void;
  onClear: () => void;
}) {
  if ("status" in search) {
    return (
      <div className={styles.results} aria-busy="true">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className={styles.skeleton} />
        ))}
      </div>
    );
  }
  if (!search.ok) {
    return (
      <div className={styles.message} role="alert">
        <strong>{strings.picker.loadFailed}</strong>
        <span>{strings.picker.loadFailedBody}</span>
        <button type="button" className={styles.secondary} onClick={onRetry}>
          {strings.picker.retry}
        </button>
      </div>
    );
  }
  if (search.items.length === 0) {
    return (
      <div className={styles.message}>
        <strong>{strings.picker.noResults(filters.query.trim())}</strong>
        <span>{strings.picker.noResultsBody}</span>
        <button type="button" className={styles.secondary} onClick={onClear}>
          {strings.picker.clearFilters}
        </button>
      </div>
    );
  }
  return (
    <div className={styles.results}>
      {search.items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={styles.result}
          aria-pressed={item.id === selectedId}
          onClick={() => onSelect(item)}
          style={gradeStyle(item.gradeId)}
        >
          <span className={styles.resultIcon}>
            <GameIcon iconPath={item.iconPath} size={40} fallback="" />
          </span>
          <span className={styles.resultText}>
            <span className={styles.resultName}>{item.name}</span>
            <span className={styles.resultSub}>
              {gradeNames.get(item.gradeId) ?? item.gradeId} · {item.categoryName}
              {item.options[0] ? ` · ${item.options[0]}` : ""}
            </span>
          </span>
          {item.id === currentItemId && <span className={styles.tag}>{strings.picker.equippedTag}</span>}
        </button>
      ))}
    </div>
  );
}

function Settings({
  item,
  gradeNames,
  value,
  onChange,
}: {
  item: CatalogItem;
  gradeNames: ReadonlyMap<string, string>;
  value: Omit<PickedEquipment, "item">;
  onChange: (value: Omit<PickedEquipment, "item">) => void;
}) {
  const setEnchant = (level: number) =>
    onChange({ ...value, enchantLevel: Math.max(ENCHANT_LEVEL.min, Math.min(ENCHANT_LEVEL.max, level)) });

  return (
    <>
      <div className={styles.selected} style={gradeStyle(item.gradeId)}>
        <span className={styles.selectedIcon}>
          <GameIcon iconPath={item.iconPath} size={60} fallback="" />
        </span>
        <div>
          <div className={styles.selectedName}>{item.name}</div>
          <div className={styles.resultSub}>
            {gradeNames.get(item.gradeId) ?? item.gradeId} · {item.categoryName}
          </div>
        </div>
      </div>
      {item.options.length > 0 && (
        <ul className={styles.options}>
          {item.options.map((option) => (
            <li key={option}>{option}</li>
          ))}
        </ul>
      )}
      <div className={styles.setting}>
        <div className={styles.settingHeader}>
          <span>{strings.picker.enchant}</span>
          <span className={styles.mono}>+{value.enchantLevel}</span>
        </div>
        <div className={styles.slider}>
          <button type="button" aria-label={strings.picker.lowerEnchant} onClick={() => setEnchant(value.enchantLevel - 1)}>
            −
          </button>
          <input
            type="range"
            min={ENCHANT_LEVEL.min}
            max={ENCHANT_LEVEL.max}
            step={1}
            value={value.enchantLevel}
            aria-label={strings.picker.enchantLevel}
            onChange={(event) => setEnchant(Number(event.target.value))}
          />
          <button type="button" aria-label={strings.picker.raiseEnchant} onClick={() => setEnchant(value.enchantLevel + 1)}>
            +
          </button>
        </div>
      </div>
      <div className={styles.setting}>
        <span className={styles.settingHeader}>{strings.picker.exceed}</span>
        <div className={styles.segments} role="group" aria-label={strings.picker.exceed}>
          {EXCEED_OPTIONS.map((level) => (
            <Chip key={level} pressed={value.exceedLevel === level} onClick={() => onChange({ ...value, exceedLevel: level })}>
              {level}
            </Chip>
          ))}
        </div>
      </div>
      <div className={styles.setting}>
        <span className={styles.settingHeader}>{strings.picker.status}</span>
        <div className={styles.segments} role="group" aria-label={strings.picker.status}>
          <Chip pressed={!value.acquired} onClick={() => onChange({ ...value, acquired: false })}>
            {strings.picker.planned}
          </Chip>
          <Chip pressed={value.acquired} onClick={() => onChange({ ...value, acquired: true })}>
            {strings.picker.acquired}
          </Chip>
        </div>
      </div>
    </>
  );
}

export function ItemPicker({
  partyId,
  memberLabel,
  slot,
  current,
  currentItem,
  grades,
  onClose,
  onSave,
  onClear,
}: {
  partyId: string;
  memberLabel: string;
  slot: SlotDefinition;
  current: MemberEquipment | null;
  currentItem: CatalogItem | null;
  grades: readonly CatalogGrade[];
  onClose: () => void;
  onSave: (picked: PickedEquipment) => void;
  onClear: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [filters, setFilters] = useState<Filters>(() => ({
    ...EMPTY_FILTERS,
    category: slot.categories.length > 1 && currentItem ? currentItem.categoryName : null,
  }));
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<CatalogItem | null>(currentItem);
  const [settings, setSettings] = useState({
    enchantLevel: current?.enchantLevel ?? 0,
    exceedLevel: current?.exceedLevel ?? 0,
    acquired: current?.acquired ?? false,
  });
  const search = useItemSearch(partyId, slot.slotPos, filters, attempt);
  const gradeNames = new Map(grades.map((grade) => [grade.id, grade.name]));
  const slotLabel = strings.slotLabel(slot.slotPosName);

  useEffect(() => {
    const element = dialog.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    return () => {
      element?.close();
      trigger?.focus();
    };
  }, []);

  const count = "status" in search || !search.ok ? "" : strings.picker.count(search.items.length, search.limited);

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-label={strings.picker.title(slotLabel)}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.frame}>
        <header className={styles.header}>
          <div>
            <div className={styles.eyebrow}>{memberLabel}</div>
            <h2 className={styles.title}>{strings.picker.title(slotLabel)}</h2>
          </div>
          <button type="button" className={styles.close} aria-label={strings.picker.close} onClick={onClose}>
            ✕
          </button>
        </header>
        <FilterBar slot={slot} grades={grades} filters={filters} onChange={setFilters} count={count} />
        <div className={styles.body}>
          <ResultList
            search={search}
            filters={filters}
            selectedId={selected?.id ?? null}
            currentItemId={currentItem?.id ?? null}
            gradeNames={gradeNames}
            onSelect={setSelected}
            onRetry={() => setAttempt((value) => value + 1)}
            onClear={() => setFilters(EMPTY_FILTERS)}
          />
          <aside className={styles.detail}>
            <div className={styles.detailScroll}>
              {selected ? (
                <Settings item={selected} gradeNames={gradeNames} value={settings} onChange={setSettings} />
              ) : (
                <p className={styles.prompt}>{strings.picker.selectPrompt}</p>
              )}
            </div>
            <div className={styles.actions}>
              {current && (
                <button type="button" className={styles.clear} onClick={onClear}>
                  {strings.picker.clearSlot}
                </button>
              )}
              <button type="button" className={styles.secondary} onClick={onClose}>
                {strings.picker.cancel}
              </button>
              <button
                type="button"
                className={styles.primary}
                disabled={!selected}
                onClick={() => selected && onSave({ item: selected, ...settings })}
              >
                {current ? strings.picker.update : strings.picker.equip}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </dialog>
  );
}
