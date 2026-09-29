"use client";

import { useMemo, useState } from "react";
import { PARTY_NAME_LENGTH } from "@/lib/db/schema";
import type { CatalogClass, CatalogSkill } from "@/lib/party/catalog";
import type { SlotDefinition } from "@/lib/party/slots";
import type { PartySnapshot } from "@/lib/party/snapshot";
import { memberStats, moveInList } from "@/lib/party/stats";
import { strings } from "@/lib/strings";
import { AddMemberForm, type NewMember } from "./add-member-form";
import { CompositionCards } from "./composition-cards";
import styles from "./party.module.css";
import { Roster, type RosterEntry } from "./roster";
import { useParty, type SaveStatus } from "./use-party";

export interface PartyViewCatalog {
  classes: CatalogClass[];
  slots: SlotDefinition[];
  skills: CatalogSkill[];
  missing: string[];
}

const SAVE_LABELS: Record<SaveStatus, string> = {
  idle: "",
  saving: strings.party.saving,
  saved: strings.party.saved,
  error: "",
};

function PartyTitle({
  name,
  canEdit,
  onRename,
}: {
  name: string;
  canEdit: boolean;
  onRename: (name: string) => void;
}) {
  const [draft, setDraft] = useState(name);
  const [editedFrom, setEditedFrom] = useState(name);
  if (editedFrom !== name) {
    setEditedFrom(name);
    setDraft(name);
  }

  if (!canEdit) return <h1 className={styles.titleStatic}>{name}</h1>;

  function commit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) onRename(trimmed);
    else setDraft(name);
  }

  return (
    <input
      id="party-name"
      className={styles.titleInput}
      value={draft}
      maxLength={PARTY_NAME_LENGTH.max}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}

function EmptyRoster({ canEdit, onAdd }: { canEdit: boolean; onAdd: () => void }) {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyTitle}>{strings.party.emptyTitle}</div>
      <div className={styles.emptyBody}>{strings.party.emptyBody}</div>
      {canEdit && (
        <button type="button" className={styles.primaryButton} onClick={onAdd}>
          {strings.party.emptyAction}
        </button>
      )}
    </div>
  );
}

export function PartyView({
  initial,
  catalog,
  canEdit,
}: {
  initial: PartySnapshot;
  catalog: PartyViewCatalog;
  canEdit: boolean;
}) {
  const { snapshot, saveStatus, notice, submit, dismissNotice } = useParty(initial);
  const [adding, setAdding] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const { members } = snapshot;

  const entries = useMemo<RosterEntry[]>(() => {
    const classById = new Map(catalog.classes.map((entry) => [entry.id, entry]));
    return members.map((member) => ({
      member,
      className: classById.get(member.classId)?.displayName ?? "—",
      stats: memberStats(
        member,
        catalog.slots,
        catalog.skills.filter((skill) => skill.classId === member.classId),
      ),
    }));
  }, [members, catalog]);

  function addMember(member: NewMember) {
    setAdding(false);
    setAnnouncement(strings.party.announceAdded(member.name));
    void submit({ type: "addMember", ...member });
  }

  function moveMember(memberId: string, toIndex: number) {
    const from = members.findIndex((member) => member.id === memberId);
    if (from === -1 || from === toIndex) return;
    setAnnouncement(strings.party.announceMoved(members[from].name, toIndex + 1, members.length));
    void submit({ type: "moveMember", memberId, toIndex }, (current) => ({
      ...current,
      members: moveInList(current.members, from, toIndex),
    }));
  }

  function removeMember(memberId: string) {
    const member = members.find((entry) => entry.id === memberId);
    if (member) setAnnouncement(strings.party.announceRemoved(member.name));
    void submit({ type: "removeMember", memberId }, (current) => ({
      ...current,
      members: current.members.filter((entry) => entry.id !== memberId),
    }));
  }

  return (
    <div className={styles.screen}>
      {catalog.missing.length > 0 && (
        <div className={styles.notice} role="status">
          {strings.party.catalogMissing}
        </div>
      )}
      {notice && (
        <div className={styles.notice} role="alert">
          <span>{notice}</span>
          <button type="button" onClick={dismissNotice}>
            {strings.party.dismiss}
          </button>
        </div>
      )}
      <div className={styles.titleRow}>
        <div className={styles.titleBlock}>
          <label htmlFor="party-name" className={styles.eyebrow}>
            {strings.party.nameLabel}
          </label>
          <PartyTitle
            name={snapshot.name}
            canEdit={canEdit}
            onRename={(name) => void submit({ type: "renameParty", name }, (current) => ({ ...current, name }))}
          />
          <div className={styles.muted}>
            {members.length ? strings.party.memberCount(members.length) : strings.party.noMembersCount}
            {" · "}
            {canEdit ? strings.party.accessEdit : strings.party.accessView}
          </div>
        </div>
        <div className={styles.buttonRow}>
          <span className={styles.saveStatus} aria-live="polite">
            {SAVE_LABELS[saveStatus]}
          </span>
          {canEdit && catalog.classes.length > 0 && (
            <button type="button" className={styles.primaryButton} onClick={() => setAdding(true)}>
              {strings.party.addMember}
            </button>
          )}
        </div>
      </div>

      <CompositionCards members={members} />

      {adding && canEdit && (
        <AddMemberForm classes={catalog.classes} onSubmit={addMember} onCancel={() => setAdding(false)} />
      )}

      {members.length === 0 ? (
        <EmptyRoster canEdit={canEdit && catalog.classes.length > 0} onAdd={() => setAdding(true)} />
      ) : (
        <Roster entries={entries} canEdit={canEdit} onMove={moveMember} onRemove={removeMember} />
      )}

      <div aria-live="polite" className={styles.visuallyHidden}>
        {announcement}
      </div>
    </div>
  );
}
