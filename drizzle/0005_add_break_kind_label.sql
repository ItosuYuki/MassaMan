CREATE TYPE "public"."therapist_break_kind" AS ENUM('break', 'unavailable');--> statement-breakpoint
ALTER TABLE "therapist_breaks" ADD COLUMN "kind" "therapist_break_kind" DEFAULT 'break' NOT NULL;--> statement-breakpoint
ALTER TABLE "therapist_breaks" ADD COLUMN "label" text;
