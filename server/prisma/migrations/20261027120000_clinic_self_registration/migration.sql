-- TEN-001 (revised): clinics register themselves. A sign-up waits here until its email code is verified.

-- CreateTable
CREATE TABLE "pending_registration" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "clinic_name" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "send_count" INTEGER NOT NULL DEFAULT 1,
    "last_sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumed_at" TIMESTAMPTZ(6),

    CONSTRAINT "pending_registration_pkey" PRIMARY KEY ("id")
);

-- Look-ups and per-email rate limits match emails case-insensitively, like user_account (CON-13).
CREATE INDEX "pending_registration_email_lower_idx" ON "pending_registration" (lower("email"));

-- Self-registered clinics start on a trial of this plan (SUB-001 groundwork; limits arrive in R2).
INSERT INTO "plan" ("name") VALUES ('Pilot');
