-- Back-dated attendance (VIS-001): marking a visit for an earlier day is its own permission.
INSERT INTO "permission" ("key", "description") VALUES ('visit.backdate', 'Mark attendance for an earlier day');

-- Every existing owner role keeps the full set of clinic permissions (new clinics get it from the role templates).
INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT r."id", p."id" FROM "role" r, "permission" p
WHERE r."key" = 'owner' AND p."key" = 'visit.backdate'
ON CONFLICT DO NOTHING;
