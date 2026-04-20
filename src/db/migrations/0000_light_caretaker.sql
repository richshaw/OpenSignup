CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "organizers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp with time zone,
	"image" text,
	"default_workspace_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"organizer_id" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"invited_by_id" text,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signups" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text,
	"organizer_id" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"visibility" text DEFAULT 'unlisted' NOT NULL,
	"theme" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"opens_at" timestamp with time zone,
	"closes_at" timestamp with time zone,
	"claim_token_hash" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "slot_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"signup_id" text NOT NULL,
	"workspace_id" text,
	"ref" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"display_style" text DEFAULT 'list' NOT NULL,
	"selection_rule" text DEFAULT 'none' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"collapsed_by_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slots" (
	"id" text PRIMARY KEY NOT NULL,
	"signup_id" text NOT NULL,
	"workspace_id" text,
	"group_id" text,
	"ref" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"slot_type" text NOT NULL,
	"capacity" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"location" text,
	"type_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"price_cents" integer,
	"status" text DEFAULT 'open' NOT NULL,
	"slot_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" text PRIMARY KEY NOT NULL,
	"signup_id" text NOT NULL,
	"workspace_id" text,
	"email" text NOT NULL,
	"email_lower" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"session_token_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commitments" (
	"id" text PRIMARY KEY NOT NULL,
	"slot_id" text NOT NULL,
	"signup_id" text NOT NULL,
	"workspace_id" text,
	"participant_id" text NOT NULL,
	"position" integer NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"notes_visibility" text DEFAULT 'public' NOT NULL,
	"custom_field_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"payment_id" text,
	"edit_token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "activity" (
	"id" text PRIMARY KEY NOT NULL,
	"signup_id" text,
	"workspace_id" text,
	"actor_id" text,
	"actor_type" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_links" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"email" text NOT NULL,
	"purpose" text NOT NULL,
	"scope_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "magic_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "signup_claims" (
	"id" text PRIMARY KEY NOT NULL,
	"signup_id" text NOT NULL,
	"claim_token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by_id" text,
	CONSTRAINT "signup_claims_claim_token_hash_unique" UNIQUE("claim_token_hash")
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"organizer_id" text,
	"participant_scope" text,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_body" text NOT NULL,
	"response_status" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"bucket" text NOT NULL,
	"subject" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_organizer_id_organizers_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."organizers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_invited_by_id_organizers_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."organizers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signups" ADD CONSTRAINT "signups_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signups" ADD CONSTRAINT "signups_organizer_id_organizers_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."organizers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_groups" ADD CONSTRAINT "slot_groups_signup_id_signups_id_fk" FOREIGN KEY ("signup_id") REFERENCES "public"."signups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_groups" ADD CONSTRAINT "slot_groups_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_signup_id_signups_id_fk" FOREIGN KEY ("signup_id") REFERENCES "public"."signups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_group_id_slot_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."slot_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_signup_id_signups_id_fk" FOREIGN KEY ("signup_id") REFERENCES "public"."signups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_slot_id_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_signup_id_signups_id_fk" FOREIGN KEY ("signup_id") REFERENCES "public"."signups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_signup_id_signups_id_fk" FOREIGN KEY ("signup_id") REFERENCES "public"."signups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_organizers_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."organizers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_organizers_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."organizers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspaces_type_idx" ON "workspaces" USING btree ("type");--> statement-breakpoint
CREATE INDEX "organizers_email_idx" ON "organizers" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_members_unique" ON "workspace_members" USING btree ("workspace_id","organizer_id");--> statement-breakpoint
CREATE INDEX "workspace_members_by_organizer" ON "workspace_members" USING btree ("organizer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "signups_slug_unique" ON "signups" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "signups_by_workspace_created" ON "signups" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "signups_by_organizer" ON "signups" USING btree ("organizer_id");--> statement-breakpoint
CREATE INDEX "signups_by_status" ON "signups" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "slot_groups_ref_unique" ON "slot_groups" USING btree ("signup_id","ref");--> statement-breakpoint
CREATE INDEX "slot_groups_by_signup_sort" ON "slot_groups" USING btree ("signup_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "slots_ref_unique" ON "slots" USING btree ("signup_id","ref");--> statement-breakpoint
CREATE INDEX "slots_by_signup_sort" ON "slots" USING btree ("signup_id","sort_order");--> statement-breakpoint
CREATE INDEX "slots_by_workspace" ON "slots" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "slots_by_group" ON "slots" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "slots_by_slot_at" ON "slots" USING btree ("slot_at");--> statement-breakpoint
CREATE UNIQUE INDEX "participants_signup_email" ON "participants" USING btree ("signup_id","email_lower");--> statement-breakpoint
CREATE INDEX "participants_by_signup" ON "participants" USING btree ("signup_id");--> statement-breakpoint
CREATE UNIQUE INDEX "commitments_slot_position_unique" ON "commitments" USING btree ("slot_id","position");--> statement-breakpoint
CREATE INDEX "commitments_by_slot_status" ON "commitments" USING btree ("slot_id","status");--> statement-breakpoint
CREATE INDEX "commitments_by_signup" ON "commitments" USING btree ("signup_id");--> statement-breakpoint
CREATE INDEX "commitments_by_participant" ON "commitments" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "commitments_by_workspace" ON "commitments" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "activity_by_signup_occurred" ON "activity" USING btree ("signup_id","occurred_at");--> statement-breakpoint
CREATE INDEX "activity_by_workspace_occurred" ON "activity" USING btree ("workspace_id","occurred_at");--> statement-breakpoint
CREATE INDEX "activity_by_event" ON "activity" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "magic_links_by_email" ON "magic_links" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_unique_org" ON "idempotency_keys" USING btree ("organizer_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_unique_par" ON "idempotency_keys" USING btree ("participant_scope","key");--> statement-breakpoint
CREATE UNIQUE INDEX "rate_limits_pk" ON "rate_limits" USING btree ("bucket","subject","window_start");