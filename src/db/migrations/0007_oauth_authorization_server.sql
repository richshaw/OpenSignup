CREATE TABLE "oauth_records" (
	"model" text NOT NULL,
	"id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"grant_id" text,
	"uid" text,
	"user_code" text,
	"account_id" text,
	"client_id" text,
	"expires_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "oauth_records_model_id_pk" PRIMARY KEY("model","id")
);
--> statement-breakpoint
CREATE TABLE "oauth_signing_keys" (
	"kid" text PRIMARY KEY NOT NULL,
	"alg" text NOT NULL,
	"jwk" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "oauth_records_by_grant" ON "oauth_records" USING btree ("grant_id");--> statement-breakpoint
CREATE INDEX "oauth_records_by_uid" ON "oauth_records" USING btree ("uid");--> statement-breakpoint
CREATE INDEX "oauth_records_by_user_code" ON "oauth_records" USING btree ("user_code");--> statement-breakpoint
CREATE INDEX "oauth_records_by_account" ON "oauth_records" USING btree ("model","account_id");--> statement-breakpoint
CREATE INDEX "oauth_records_by_expiry" ON "oauth_records" USING btree ("expires_at");