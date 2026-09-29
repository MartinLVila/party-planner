"use client";

import { useState, type FormEvent } from "react";
import { MEMBER_NAME_LENGTH, ROLES, type Role } from "@/lib/db/schema";
import type { CatalogClass } from "@/lib/party/catalog";
import { strings } from "@/lib/strings";
import styles from "./party.module.css";

const DEFAULT_ROLE_BY_CLASS: Record<string, Role> = { Templar: "Tank", Cleric: "Healer", Chanter: "Support" };

export const defaultRoleFor = (entry: CatalogClass | undefined): Role =>
  (entry && DEFAULT_ROLE_BY_CLASS[entry.name]) ?? "DPS";

export interface NewMember {
  name: string;
  classId: number;
  role: Role;
}

export function AddMemberForm({
  classes,
  onSubmit,
  onCancel,
}: {
  classes: readonly CatalogClass[];
  onSubmit: (member: NewMember) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [classId, setClassId] = useState(classes[0]?.id ?? 0);
  const [role, setRole] = useState<Role>(defaultRoleFor(classes[0]));
  const trimmed = name.trim();

  function chooseClass(id: number) {
    setClassId(id);
    setRole(defaultRoleFor(classes.find((entry) => entry.id === id)));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!trimmed || !classId) return;
    onSubmit({ name: trimmed, classId, role });
  }

  return (
    <form onSubmit={submit} className={styles.addForm}>
      <label className={styles.addField}>
        <span className={styles.fieldLabel}>{strings.addMember.nameLabel}</span>
        <input
          className={styles.control}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={strings.addMember.namePlaceholder}
          maxLength={MEMBER_NAME_LENGTH.max}
          autoFocus
          required
        />
      </label>
      <label className={styles.addField}>
        <span className={styles.fieldLabel}>{strings.addMember.classLabel}</span>
        <select className={styles.control} value={classId} onChange={(event) => chooseClass(Number(event.target.value))}>
          {classes.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.displayName}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.addField}>
        <span className={styles.fieldLabel}>{strings.addMember.roleLabel}</span>
        <select className={styles.control} value={role} onChange={(event) => setRole(event.target.value as Role)}>
          {ROLES.map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
      </label>
      <div className={styles.buttonRow}>
        <button type="button" className={styles.ghostButton} onClick={onCancel}>
          {strings.addMember.cancel}
        </button>
        <button type="submit" className={styles.primaryButton} disabled={!trimmed || !classId}>
          {strings.addMember.submit}
        </button>
      </div>
    </form>
  );
}
