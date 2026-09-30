CREATE TABLE "catalog_state" (
	"kind" text PRIMARY KEY NOT NULL,
	"active_run_id" integer NOT NULL,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"run_id" integer NOT NULL,
	"id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"skill_point_cap" integer,
	CONSTRAINT "classes_run_id_id_pk" PRIMARY KEY("run_id","id")
);
--> statement-breakpoint
CREATE TABLE "equipment_slots" (
	"run_id" integer NOT NULL,
	"slot_pos" smallint NOT NULL,
	"slot_pos_name" text NOT NULL,
	CONSTRAINT "equipment_slots_run_id_slot_pos_pk" PRIMARY KEY("run_id","slot_pos")
);
--> statement-breakpoint
CREATE TABLE "item_categories" (
	"run_id" integer NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" text,
	CONSTRAINT "item_categories_run_id_id_pk" PRIMARY KEY("run_id","id")
);
--> statement-breakpoint
CREATE TABLE "item_grades" (
	"run_id" integer NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"rank" smallint NOT NULL,
	CONSTRAINT "item_grades_run_id_id_pk" PRIMARY KEY("run_id","id")
);
--> statement-breakpoint
CREATE TABLE "items" (
	"run_id" integer NOT NULL,
	"id" bigint NOT NULL,
	"name" text NOT NULL,
	"icon_path" text NOT NULL,
	"grade_id" text NOT NULL,
	"category_name" text NOT NULL,
	"options" text[] NOT NULL,
	"tradable" boolean NOT NULL,
	CONSTRAINT "items_run_id_id_pk" PRIMARY KEY("run_id","id")
);
--> statement-breakpoint
CREATE TABLE "member_equipment" (
	"member_id" uuid NOT NULL,
	"slot_pos" smallint NOT NULL,
	"item_id" bigint NOT NULL,
	"enchant_level" smallint DEFAULT 0 NOT NULL,
	"exceed_level" smallint DEFAULT 0 NOT NULL,
	"acquired" boolean DEFAULT false NOT NULL,
	CONSTRAINT "member_equipment_member_id_slot_pos_pk" PRIMARY KEY("member_id","slot_pos"),
	CONSTRAINT "member_equipment_enchant_level" CHECK ("member_equipment"."enchant_level" BETWEEN 0 AND 20),
	CONSTRAINT "member_equipment_exceed_level" CHECK ("member_equipment"."exceed_level" BETWEEN 0 AND 5)
);
--> statement-breakpoint
CREATE TABLE "member_skills" (
	"member_id" uuid NOT NULL,
	"skill_id" bigint NOT NULL,
	"level" smallint NOT NULL,
	"equipped" boolean DEFAULT false NOT NULL,
	CONSTRAINT "member_skills_member_id_skill_id_pk" PRIMARY KEY("member_id","skill_id"),
	CONSTRAINT "member_skills_level" CHECK ("member_skills"."level" BETWEEN 1 AND 30)
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"party_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"name" text NOT NULL,
	"class_id" integer NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "members_role" CHECK ("members"."role" IN ('Tank', 'Healer', 'DPS', 'Support')),
	CONSTRAINT "members_name_length" CHECK (char_length("members"."name") BETWEEN 1 AND 40),
	CONSTRAINT "members_position" CHECK ("members"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "parties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"edit_token_hash" "bytea" NOT NULL,
	"view_token_hash" "bytea" NOT NULL,
	"password_hash" text NOT NULL,
	"credential_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parties_edit_token_hash_unique" UNIQUE("edit_token_hash"),
	CONSTRAINT "parties_view_token_hash_unique" UNIQUE("view_token_hash"),
	CONSTRAINT "parties_name_length" CHECK (char_length("parties"."name") BETWEEN 1 AND 80)
);
--> statement-breakpoint
CREATE TABLE "party_password_throttle" (
	"party_id" uuid PRIMARY KEY NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "party_revisions" (
	"party_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "party_revisions_party_id_revision_pk" PRIMARY KEY("party_id","revision")
);
--> statement-breakpoint
CREATE TABLE "party_sessions" (
	"id_hash" "bytea" PRIMARY KEY NOT NULL,
	"party_id" uuid NOT NULL,
	"access" text NOT NULL,
	"credential_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "party_sessions_access" CHECK ("party_sessions"."access" IN ('view', 'edit'))
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"run_id" integer NOT NULL,
	"id" bigint NOT NULL,
	"class_id" integer NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"icon_path" text NOT NULL,
	"required_level" smallint NOT NULL,
	"max_level_seen" smallint NOT NULL,
	"point_cost_per_level" integer,
	CONSTRAINT "skills_run_id_id_pk" PRIMARY KEY("run_id","id"),
	CONSTRAINT "skills_category" CHECK ("skills"."category" IN ('Active', 'Passive', 'Dp'))
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"source" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"examined" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	CONSTRAINT "sync_runs_kind" CHECK ("sync_runs"."kind" IN ('classes', 'items', 'character_sample')),
	CONSTRAINT "sync_runs_status" CHECK ("sync_runs"."status" IN ('running', 'succeeded', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "catalog_state" ADD CONSTRAINT "catalog_state_active_run_id_sync_runs_id_fk" FOREIGN KEY ("active_run_id") REFERENCES "public"."sync_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_run_id_sync_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."sync_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_slots" ADD CONSTRAINT "equipment_slots_run_id_sync_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."sync_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_categories" ADD CONSTRAINT "item_categories_run_id_sync_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."sync_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_grades" ADD CONSTRAINT "item_grades_run_id_sync_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."sync_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_run_id_sync_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."sync_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_equipment" ADD CONSTRAINT "member_equipment_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_skills" ADD CONSTRAINT "member_skills_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_password_throttle" ADD CONSTRAINT "party_password_throttle_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_revisions" ADD CONSTRAINT "party_revisions_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_sessions" ADD CONSTRAINT "party_sessions_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_run_id_sync_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."sync_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "items_run_category" ON "items" USING btree ("run_id","category_name");--> statement-breakpoint
CREATE INDEX "members_party" ON "members" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "party_sessions_party" ON "party_sessions" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "skills_run_class" ON "skills" USING btree ("run_id","class_id");--> statement-breakpoint
CREATE INDEX "sync_runs_kind_started_at" ON "sync_runs" USING btree ("kind","started_at");