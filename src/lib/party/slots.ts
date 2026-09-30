export type SlotGroupId = "weapons" | "armor" | "accessories" | "arcana" | "runes" | "companions";

export interface SlotDefinition {
  slotPos: number;
  slotPosName: string;
  group: SlotGroupId;
  categories: readonly string[];
}

const WEAPON_CATEGORIES = [
  "Longsword",
  "Greatsword",
  "Dagger",
  "Bow",
  "Spellbook",
  "Orb",
  "Mace",
  "Staff",
  "Gauntlet",
  "Fist",
] as const;

const CATEGORIES_BY_SLOT_NAME: Record<string, { group: SlotGroupId; categories: readonly string[] }> = {
  MainHand: { group: "weapons", categories: WEAPON_CATEGORIES },
  SubHand: { group: "weapons", categories: ["Guard", ...WEAPON_CATEGORIES] },
  Helmet: { group: "armor", categories: ["Helm"] },
  Shoulder: { group: "armor", categories: ["Pauldrons"] },
  Torso: { group: "armor", categories: ["Top"] },
  Pants: { group: "armor", categories: ["Legs"] },
  Gloves: { group: "armor", categories: ["Gloves"] },
  Boots: { group: "armor", categories: ["Shoes"] },
  Cape: { group: "armor", categories: ["Cloak"] },
  Necklace: { group: "accessories", categories: ["Necklace"] },
  Earring1: { group: "accessories", categories: ["Earrings"] },
  Earring2: { group: "accessories", categories: ["Earrings"] },
  Ring1: { group: "accessories", categories: ["Ring"] },
  Ring2: { group: "accessories", categories: ["Ring"] },
  Bracelet1: { group: "accessories", categories: ["Bracelet"] },
  Bracelet2: { group: "accessories", categories: ["Bracelet"] },
  Belt: { group: "accessories", categories: ["Belt"] },
  Brooch1: { group: "accessories", categories: ["Brooch"] },
  Brooch2: { group: "accessories", categories: ["Brooch"] },
  Seal1: { group: "accessories", categories: ["Seal"] },
  Seal2: { group: "accessories", categories: ["Seal"] },
  Amulet: { group: "accessories", categories: ["Amulet"] },
  Pendant: { group: "accessories", categories: ["Pendant"] },
};

export const COMPANION_SLOTS: readonly SlotDefinition[] = [
  { slotPos: 101, slotPosName: "Wing", group: "companions", categories: ["Wings"] },
  { slotPos: 102, slotPosName: "Pet", group: "companions", categories: [] },
];

function groupForUnmapped(slotPosName: string): SlotGroupId {
  if (slotPosName.startsWith("Arcana")) return "arcana";
  if (slotPosName.startsWith("Rune")) return "runes";
  return "accessories";
}

export function defineSlots(observed: readonly { slotPos: number; slotPosName: string }[]): SlotDefinition[] {
  const fromEquipment = observed.map(({ slotPos, slotPosName }) => {
    const known = CATEGORIES_BY_SLOT_NAME[slotPosName];
    return known
      ? { slotPos, slotPosName, ...known }
      : { slotPos, slotPosName, group: groupForUnmapped(slotPosName), categories: [] };
  });
  return [...fromEquipment, ...COMPANION_SLOTS];
}

export const hasCatalog = (slot: SlotDefinition) => slot.categories.length > 0;

export const SLOT_GROUP_ORDER: readonly SlotGroupId[] = ["weapons", "armor", "accessories", "arcana", "runes", "companions"];

export const EQUIPMENT_SLOT_ORDER: readonly string[] = [
  "MainHand",
  "SubHand",
  "Helmet",
  "Shoulder",
  "Torso",
  "Pants",
  "Gloves",
  "Boots",
  "Cape",
  "Necklace",
  "Pendant",
  "Amulet",
  "Earring1",
  "Earring2",
  "Ring1",
  "Ring2",
  "Bracelet1",
  "Bracelet2",
  "Belt",
  "Brooch1",
  "Brooch2",
  "Seal1",
  "Seal2",
];

export function sortSlots(slots: readonly SlotDefinition[]): SlotDefinition[] {
  const rank = (slot: SlotDefinition) => {
    const index = EQUIPMENT_SLOT_ORDER.indexOf(slot.slotPosName);
    return index === -1 ? EQUIPMENT_SLOT_ORDER.length + slot.slotPos : index;
  };
  return [...slots].sort(
    (a, b) => SLOT_GROUP_ORDER.indexOf(a.group) - SLOT_GROUP_ORDER.indexOf(b.group) || rank(a) - rank(b),
  );
}
