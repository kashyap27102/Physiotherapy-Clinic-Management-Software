-- Finance dashboard: money figures get their own permission, so the dashboard can be shared without showing revenue.
-- Every role that could see the dashboard (report.view) keeps seeing the money until the owner changes it.
INSERT INTO "permission" ("key", "description") VALUES ('finance.view', 'Finance dashboard');

INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT rp."role_id", fp."id"
FROM "role_permission" rp
JOIN "permission" rv ON rv."id" = rp."permission_id" AND rv."key" = 'report.view'
JOIN "permission" fp ON fp."key" = 'finance.view'
ON CONFLICT DO NOTHING;
