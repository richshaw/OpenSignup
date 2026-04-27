CREATE TABLE "slot_fields" (
	"id" text PRIMARY KEY NOT NULL,
	"signup_id" text NOT NULL,
	"workspace_id" text,
	"ref" text NOT NULL,
	"label" text NOT NULL,
	"field_type" text NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "slot_groups" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "slot_groups" CASCADE;--> statement-breakpoint
DROP INDEX IF EXISTS "slots_by_group";--> statement-breakpoint
ALTER TABLE "slots" ADD COLUMN "values" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "slot_fields" ADD CONSTRAINT "slot_fields_signup_id_signups_id_fk" FOREIGN KEY ("signup_id") REFERENCES "public"."signups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_fields" ADD CONSTRAINT "slot_fields_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "slot_fields_ref_unique" ON "slot_fields" USING btree ("signup_id","ref");--> statement-breakpoint
CREATE INDEX "slot_fields_by_signup_sort" ON "slot_fields" USING btree ("signup_id","sort_order");--> statement-breakpoint
ALTER TABLE "slots" DROP COLUMN "group_id";--> statement-breakpoint
ALTER TABLE "slots" DROP COLUMN "title";--> statement-breakpoint
ALTER TABLE "slots" DROP COLUMN "description";--> statement-breakpoint
ALTER TABLE "slots" DROP COLUMN "slot_type";--> statement-breakpoint
ALTER TABLE "slots" DROP COLUMN "location";--> statement-breakpoint
ALTER TABLE "slots" DROP COLUMN "type_data";