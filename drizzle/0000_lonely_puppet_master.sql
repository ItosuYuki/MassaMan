CREATE TYPE "public"."age_bracket" AS ENUM('20s', '30s', '40s', '50s_plus');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('male', 'female', 'unspecified');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('in_app', 'email', 'slack');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('confirmed', 'cancelled', 'completed', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'therapist', 'admin');--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"minutes_before" integer NOT NULL,
	"slack_user_id" text
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"therapist_id" uuid NOT NULL,
	"room_id" uuid,
	"reservation_date" date NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"requested_note" text,
	"status" "reservation_status" DEFAULT 'confirmed' NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_reservation_id_unique" UNIQUE("reservation_id"),
	CONSTRAINT "reviews_rating_check" CHECK ("reviews"."rating" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "therapist_breaks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_id" uuid NOT NULL,
	"break_start" time NOT NULL,
	"break_end" time NOT NULL
);
--> statement-breakpoint
CREATE TABLE "therapist_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"specialties" text[],
	"bio" text,
	"photo_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "therapist_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "therapist_shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"therapist_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_code" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"department_id" uuid,
	"role" "user_role" NOT NULL,
	"gender" "gender" NOT NULL,
	"age_bracket" "age_bracket",
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_employee_code_unique" UNIQUE("employee_code"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_therapist_id_therapist_profiles_id_fk" FOREIGN KEY ("therapist_id") REFERENCES "public"."therapist_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "therapist_breaks" ADD CONSTRAINT "therapist_breaks_shift_id_therapist_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."therapist_shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "therapist_profiles" ADD CONSTRAINT "therapist_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "therapist_shifts" ADD CONSTRAINT "therapist_shifts_therapist_id_therapist_profiles_id_fk" FOREIGN KEY ("therapist_id") REFERENCES "public"."therapist_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_notification_settings_user_id" ON "notification_settings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_reservations_therapist_date" ON "reservations" USING btree ("therapist_id","reservation_date");--> statement-breakpoint
CREATE INDEX "idx_reservations_user_date" ON "reservations" USING btree ("user_id","reservation_date");--> statement-breakpoint
CREATE INDEX "idx_reservations_date_status" ON "reservations" USING btree ("reservation_date","status");--> statement-breakpoint
CREATE INDEX "idx_therapist_breaks_shift_id" ON "therapist_breaks" USING btree ("shift_id");--> statement-breakpoint
CREATE UNIQUE INDEX "therapist_shifts_therapist_id_work_date_key" ON "therapist_shifts" USING btree ("therapist_id","work_date");--> statement-breakpoint
CREATE INDEX "idx_users_department_id" ON "users" USING btree ("department_id");--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "no_overlap_per_therapist"
EXCLUDE USING gist (
  therapist_id WITH =,
  tsrange(
    (reservation_date + start_time)::timestamp,
    (reservation_date + end_time)::timestamp,
    '[)'
  ) WITH &&
) WHERE (status = 'confirmed');
--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "no_overlap_per_room"
EXCLUDE USING gist (
  room_id WITH =,
  tsrange(
    (reservation_date + start_time)::timestamp,
    (reservation_date + end_time)::timestamp,
    '[)'
  ) WITH &&
) WHERE (status = 'confirmed' AND room_id IS NOT NULL);