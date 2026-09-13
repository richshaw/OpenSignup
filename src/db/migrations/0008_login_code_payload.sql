ALTER TABLE "magic_links" ADD COLUMN "payload_encrypted" text;--> statement-breakpoint
CREATE INDEX "magic_links_by_expiry" ON "magic_links" USING btree ("expires_at");