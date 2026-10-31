-- Bulk attendance (VIS-001): marking many visits in one go is its own permission, held by the owner by default.
INSERT INTO "permission" ("key", "description") VALUES ('visit.bulk', 'Mark attendance in bulk');

INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT r."id", p."id" FROM "role" r, "permission" p
WHERE r."key" = 'owner' AND p."key" = 'visit.bulk'
ON CONFLICT DO NOTHING;
