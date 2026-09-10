CREATE UNIQUE INDEX IF NOT EXISTS "notification_settings_user_channel_key"
  ON "notification_settings" USING btree ("user_id", "channel");
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"reservation_id" uuid,
	"channel" "notification_channel" NOT NULL,
	"event_type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_reservation_id_reservations_id_fk"
  FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_notification_deliveries_user_created"
  ON "notification_deliveries" USING btree ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX "idx_notification_deliveries_reservation"
  ON "notification_deliveries" USING btree ("reservation_id");
