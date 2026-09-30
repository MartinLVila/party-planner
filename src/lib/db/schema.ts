import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Uint8Array }>({
  dataType: () => "bytea",
  fromDriver: (value) => Buffer.from(value),
});

export const SYNC_KINDS = ["classes", "items", "character_sample"] as const;
export type SyncKind = (typeof SYNC_KINDS)[number];

export const SYNC_STATUSES = ["running", "succeeded", "failed"] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

export const SKILL_CATEGORIES = ["Active", "Passive", "Dp"] as const;
export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

export const ROLES = ["Tank", "Healer", "DPS", "Support"] as const;
export type Role = (typeof ROLES)[number];

export const ACCESS_LEVELS = ["view", "edit"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export const ENCHANT_LEVEL = { min: 0, max: 20 } as const;
export const EXCEED_LEVEL = { min: 0, max: 5 } as const;
export const SKILL_LEVEL = { min: 1, max: 30 } as const;
export const PARTY_NAME_LENGTH = { min: 1, max: 80 } as const;
export const MEMBER_NAME_LENGTH = { min: 1, max: 40 } as const;

const oneOf = (values: readonly string[]) => sql.raw(values.map((value) => `'${value}'`).join(", "));

const between = (range: { min: number; max: number }) =>
  sql.raw(`${range.min} AND ${range.max}`);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").$type<SyncKind>().notNull(),
    status: text("status").$type<SyncStatus>().notNull().default("running"),
    source: text("source").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    examined: jsonb("examined").$type<Record<string, unknown>>().notNull().default({}),
    error: text("error"),
  },
  (table) => [
    check("sync_runs_kind", sql`${table.kind} IN (${oneOf(SYNC_KINDS)})`),
    check("sync_runs_status", sql`${table.status} IN (${oneOf(SYNC_STATUSES)})`),
    index("sync_runs_kind_started_at").on(table.kind, table.startedAt),
  ],
);

export const catalogState = pgTable("catalog_state", {
  kind: text("kind").$type<SyncKind>().primaryKey(),
  activeRunId: integer("active_run_id")
    .notNull()
    .references(() => syncRuns.id),
  activatedAt: timestamp("activated_at", { withTimezone: true }).notNull().defaultNow(),
});

const runId = () =>
  integer("run_id")
    .notNull()
    .references(() => syncRuns.id, { onDelete: "cascade" });

export const classes = pgTable(
  "classes",
  {
    runId: runId(),
    id: integer("id").notNull(),
    name: text("name").notNull(),
    displayName: text("display_name").notNull(),
    skillPointCap: integer("skill_point_cap"),
  },
  (table) => [primaryKey({ columns: [table.runId, table.id] })],
);

export const itemGrades = pgTable(
  "item_grades",
  {
    runId: runId(),
    id: text("id").notNull(),
    name: text("name").notNull(),
    rank: smallint("rank").notNull(),
  },
  (table) => [primaryKey({ columns: [table.runId, table.id] })],
);

export const itemCategories = pgTable(
  "item_categories",
  {
    runId: runId(),
    id: text("id").notNull(),
    name: text("name").notNull(),
    parentId: text("parent_id"),
  },
  (table) => [primaryKey({ columns: [table.runId, table.id] })],
);

export const items = pgTable(
  "items",
  {
    runId: runId(),
    id: bigint("id", { mode: "number" }).notNull(),
    name: text("name").notNull(),
    iconPath: text("icon_path").notNull(),
    gradeId: text("grade_id").notNull(),
    categoryName: text("category_name").notNull(),
    options: text("options").array().notNull(),
    description: text("description"),
    tradable: boolean("tradable").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.id] }),
    index("items_run_category").on(table.runId, table.categoryName),
  ],
);

export const skills = pgTable(
  "skills",
  {
    runId: runId(),
    id: bigint("id", { mode: "number" }).notNull(),
    classId: integer("class_id").notNull(),
    name: text("name").notNull(),
    category: text("category").$type<SkillCategory>().notNull(),
    iconPath: text("icon_path").notNull(),
    requiredLevel: smallint("required_level").notNull(),
    maxLevelSeen: smallint("max_level_seen").notNull(),
    pointCostPerLevel: integer("point_cost_per_level"),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.id] }),
    check("skills_category", sql`${table.category} IN (${oneOf(SKILL_CATEGORIES)})`),
    index("skills_run_class").on(table.runId, table.classId),
  ],
);

export const equipmentSlots = pgTable(
  "equipment_slots",
  {
    runId: runId(),
    slotPos: smallint("slot_pos").notNull(),
    slotPosName: text("slot_pos_name").notNull(),
  },
  (table) => [primaryKey({ columns: [table.runId, table.slotPos] })],
);

export const parties = pgTable(
  "parties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    revision: integer("revision").notNull().default(0),
    editTokenHash: bytea("edit_token_hash").notNull().unique(),
    viewTokenHash: bytea("view_token_hash").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    credentialVersion: integer("credential_version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("parties_name_length", sql`char_length(${table.name}) BETWEEN ${between(PARTY_NAME_LENGTH)}`),
  ],
);

export const partySessions = pgTable(
  "party_sessions",
  {
    idHash: bytea("id_hash").primaryKey(),
    partyId: uuid("party_id")
      .notNull()
      .references(() => parties.id, { onDelete: "cascade" }),
    access: text("access").$type<AccessLevel>().notNull(),
    credentialVersion: integer("credential_version").notNull(),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check("party_sessions_access", sql`${table.access} IN (${oneOf(ACCESS_LEVELS)})`),
    index("party_sessions_party").on(table.partyId),
  ],
);

export const partyPasswordThrottle = pgTable("party_password_throttle", {
  partyId: uuid("party_id")
    .primaryKey()
    .references(() => parties.id, { onDelete: "cascade" }),
  failures: integer("failures").notNull().default(0),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull().defaultNow(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
});

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  attempts: integer("attempts").notNull().default(0),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull().defaultNow(),
});

export const partyRevisions = pgTable(
  "party_revisions",
  {
    partyId: uuid("party_id")
      .notNull()
      .references(() => parties.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.partyId, table.revision] })],
);

export const members = pgTable(
  "members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    partyId: uuid("party_id")
      .notNull()
      .references(() => parties.id, { onDelete: "cascade" }),
    position: smallint("position").notNull(),
    name: text("name").notNull(),
    classId: integer("class_id").notNull(),
    role: text("role").$type<Role>().notNull(),
  },
  (table) => [
    index("members_party").on(table.partyId),
    check("members_role", sql`${table.role} IN (${oneOf(ROLES)})`),
    check("members_name_length", sql`char_length(${table.name}) BETWEEN ${between(MEMBER_NAME_LENGTH)}`),
    check("members_position", sql`${table.position} >= 0`),
  ],
);

export const memberEquipment = pgTable(
  "member_equipment",
  {
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    slotPos: smallint("slot_pos").notNull(),
    itemId: bigint("item_id", { mode: "number" }).notNull(),
    enchantLevel: smallint("enchant_level").notNull().default(0),
    exceedLevel: smallint("exceed_level").notNull().default(0),
    acquired: boolean("acquired").notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.memberId, table.slotPos] }),
    check("member_equipment_enchant_level", sql`${table.enchantLevel} BETWEEN ${between(ENCHANT_LEVEL)}`),
    check("member_equipment_exceed_level", sql`${table.exceedLevel} BETWEEN ${between(EXCEED_LEVEL)}`),
  ],
);

export const memberSkills = pgTable(
  "member_skills",
  {
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    skillId: bigint("skill_id", { mode: "number" }).notNull(),
    level: smallint("level").notNull(),
    equipped: boolean("equipped").notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.memberId, table.skillId] }),
    check("member_skills_level", sql`${table.level} BETWEEN ${between(SKILL_LEVEL)}`),
  ],
);
