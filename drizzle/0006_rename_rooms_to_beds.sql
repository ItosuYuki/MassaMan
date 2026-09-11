UPDATE "rooms" SET "name" = 'ベッドA' WHERE "name" = '第1マッサージ室';
--> statement-breakpoint
UPDATE "rooms" SET "name" = 'ベッドB' WHERE "name" = '第2マッサージ室';
--> statement-breakpoint
INSERT INTO "rooms" ("name")
SELECT "bed_name"
FROM (VALUES ('ベッドA'), ('ベッドB'), ('ベッドC')) AS "canonical_beds"("bed_name")
WHERE NOT EXISTS (
	SELECT 1 FROM "rooms" WHERE "rooms"."name" = "canonical_beds"."bed_name"
);
