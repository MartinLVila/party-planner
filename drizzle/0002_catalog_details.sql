ALTER TABLE "classes" ADD COLUMN "display_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "classes" DROP COLUMN "description";--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "description" text;
