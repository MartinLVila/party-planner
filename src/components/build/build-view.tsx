"use client";

import { useState } from "react";
import type { PartyChange } from "@/lib/party/changes";
import type { CatalogClass, CatalogGrade, CatalogItem, CatalogSkill } from "@/lib/party/catalog";
import type { SlotDefinition } from "@/lib/party/slots";
import type { PartyMember, PartySnapshot } from "@/lib/party/snapshot";
import { memberStats } from "@/lib/party/stats";
import { strings } from "@/lib/strings";
import { BuildHeader, type MemberUpdate } from "./build-header";
import styles from "./build.module.css";
import { EquipmentPanel } from "./equipment-panel";
import { ItemPicker, type PickedEquipment } from "./item-picker";
import { SkillsPanel, type SkillPlan } from "./skills-panel";

export interface BuildCatalog {
  classes: CatalogClass[];
  grades: CatalogGrade[];
  slots: SlotDefinition[];
  skills: CatalogSkill[];
}

type Submit = (change: PartyChange, optimistic?: (snapshot: PartySnapshot) => PartySnapshot) => Promise<boolean>;

const updateMember =
  (memberId: string, update: (member: PartyMember) => PartyMember) =>
  (snapshot: PartySnapshot): PartySnapshot => ({
    ...snapshot,
    members: snapshot.members.map((member) => (member.id === memberId ? update(member) : member)),
  });

function withEquipment(member: PartyMember, slotPos: number, picked: PickedEquipment | null): PartyMember {
  const others = member.equipment.filter((entry) => entry.slotPos !== slotPos);
  if (!picked) return { ...member, equipment: others };
  const { item, ...levels } = picked;
  return {
    ...member,
    equipment: [...others, { slotPos, itemId: item.id, ...levels }].sort((a, b) => a.slotPos - b.slotPos),
  };
}

function withSkill(member: PartyMember, plan: SkillPlan): PartyMember {
  const others = member.skills.filter((skill) => skill.skillId !== plan.skillId);
  return { ...member, skills: plan.level === 0 ? others : [...others, plan] };
}

function MemberTabs({
  members,
  currentId,
  onBack,
  onOpen,
}: {
  members: readonly PartyMember[];
  currentId: string;
  onBack: () => void;
  onOpen: (memberId: string) => void;
}) {
  return (
    <nav className={styles.memberTabs} aria-label={strings.party.rosterLabel}>
      <button type="button" className={styles.tab} onClick={onBack}>
        {strings.build.backToParty}
      </button>
      <span className={styles.divider} aria-hidden="true" />
      {members.map((member, index) => (
        <button
          key={member.id}
          type="button"
          className={styles.tab}
          aria-current={member.id === currentId ? "page" : undefined}
          onClick={() => onOpen(member.id)}
        >
          <span className={styles.tabPosition}>{index + 1}</span>
          {member.name}
        </button>
      ))}
    </nav>
  );
}

export function BuildView({
  snapshot,
  memberId,
  catalog,
  items,
  canEdit,
  submit,
  rememberItem,
  announce,
  onBack,
  onOpenMember,
}: {
  snapshot: PartySnapshot;
  memberId: string;
  catalog: BuildCatalog;
  items: ReadonlyMap<number, CatalogItem>;
  canEdit: boolean;
  submit: Submit;
  rememberItem: (item: CatalogItem) => void;
  announce: (message: string) => void;
  onBack: () => void;
  onOpenMember: (memberId: string) => void;
}) {
  const [pickerSlot, setPickerSlot] = useState<SlotDefinition | null>(null);
  const index = snapshot.members.findIndex((member) => member.id === memberId);
  const member = snapshot.members[index];
  if (!member) return null;

  const classSkills = catalog.skills.filter((skill) => skill.classId === member.classId);
  const stats = memberStats(member, catalog.slots, classSkills);
  const gradeNames = new Map(catalog.grades.map((grade) => [grade.id, grade.name]));
  const current = pickerSlot ? (member.equipment.find((entry) => entry.slotPos === pickerSlot.slotPos) ?? null) : null;
  const memberClass = catalog.classes.find((entry) => entry.id === member.classId);

  function update(changes: MemberUpdate) {
    void submit({ type: "updateMember", memberId, ...changes }, updateMember(memberId, (entry) => ({
      ...entry,
      ...changes,
      skills: changes.classId !== undefined && changes.classId !== entry.classId ? [] : entry.skills,
    })));
  }

  function save(slot: SlotDefinition, picked: PickedEquipment) {
    setPickerSlot(null);
    rememberItem(picked.item);
    announce(strings.picker.announceEquipped(picked.item.name, strings.slotLabel(slot.slotPosName)));
    const { item, ...levels } = picked;
    void submit(
      { type: "setEquipment", memberId, slotPos: slot.slotPos, itemId: item.id, ...levels },
      updateMember(memberId, (entry) => withEquipment(entry, slot.slotPos, picked)),
    );
  }

  function clear(slot: SlotDefinition) {
    setPickerSlot(null);
    void submit(
      { type: "clearEquipment", memberId, slotPos: slot.slotPos },
      updateMember(memberId, (entry) => withEquipment(entry, slot.slotPos, null)),
    );
  }

  function planSkill(plan: SkillPlan) {
    void submit({ type: "setSkill", memberId, ...plan }, updateMember(memberId, (entry) => withSkill(entry, plan)));
  }

  return (
    <div className={styles.screen}>
      <MemberTabs members={snapshot.members} currentId={memberId} onBack={onBack} onOpen={onOpenMember} />
      <BuildHeader
        member={member}
        position={index + 1}
        classes={catalog.classes}
        stats={stats}
        canEdit={canEdit}
        onUpdate={update}
      />
      <div className={styles.panels}>
        <EquipmentPanel
          slots={catalog.slots}
          equipment={member.equipment}
          items={items}
          grades={gradeNames}
          stats={stats}
          canEdit={canEdit}
          onOpenSlot={setPickerSlot}
        />
        <SkillsPanel skills={classSkills} plans={member.skills} stats={stats} canEdit={canEdit} onChange={planSkill} />
      </div>
      {pickerSlot && (
        <ItemPicker
          partyId={snapshot.id}
          memberLabel={`${member.name} · ${memberClass?.displayName ?? ""}`}
          slot={pickerSlot}
          current={current}
          currentItem={current ? (items.get(current.itemId) ?? null) : null}
          grades={catalog.grades}
          onClose={() => setPickerSlot(null)}
          onSave={(picked) => save(pickerSlot, picked)}
          onClear={() => clear(pickerSlot)}
        />
      )}
    </div>
  );
}
