ALTER TABLE "notification_settings"
  ADD COLUMN IF NOT EXISTS "reservation_created_enabled" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "notification_settings"
  ADD COLUMN IF NOT EXISTS "reservation_cancelled_enabled" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "notification_settings"
  ADD COLUMN IF NOT EXISTS "reminder_enabled" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
CREATE TABLE "slack_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL UNIQUE,
	"slack_team_id" text NOT NULL,
	"slack_user_id" text NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "slack_connections" ADD CONSTRAINT "slack_connections_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_slack_connections_team_user"
  ON "slack_connections" USING btree ("slack_team_id", "slack_user_id");
