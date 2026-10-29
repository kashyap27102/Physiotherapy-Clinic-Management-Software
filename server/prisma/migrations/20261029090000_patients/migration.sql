-- PAT-001 to PAT-005: patients. They belong to the clinic, not to a branch (BR-PAT-1).

-- CreateTable
CREATE TABLE "patient" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "registered_branch_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phone_contact_type" TEXT NOT NULL DEFAULT 'self',
    "date_of_birth" DATE,
    "age_years" INTEGER NOT NULL,
    "age_recorded_on" DATE NOT NULL,
    "gender" TEXT NOT NULL,
    "address" TEXT,
    "emergency_contact" TEXT,
    "occupation" TEXT,
    "referring_doctor" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "patient_tenant_id_phone_idx" ON "patient"("tenant_id", "phone");

-- CreateIndex
CREATE INDEX "patient_tenant_id_created_at_idx" ON "patient"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "patient_tenant_id_id_key" ON "patient"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "patient" ADD CONSTRAINT "patient_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: composite keys make it impossible to link a patient to another clinic's branch or user (ER 5.2).
ALTER TABLE "patient" ADD CONSTRAINT "patient_tenant_id_registered_branch_id_fkey" FOREIGN KEY ("tenant_id", "registered_branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient" ADD CONSTRAINT "patient_tenant_id_created_by_fkey" FOREIGN KEY ("tenant_id", "created_by") REFERENCES "user_account"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enums as text with CHECK constraints (ER section 1)
ALTER TABLE "patient" ADD CONSTRAINT "patient_gender_check" CHECK ("gender" IN ('male', 'female', 'other', 'undisclosed'));
ALTER TABLE "patient" ADD CONSTRAINT "patient_status_check" CHECK ("status" IN ('active', 'inactive'));
ALTER TABLE "patient" ADD CONSTRAINT "patient_phone_contact_type_check" CHECK ("phone_contact_type" IN ('self', 'guardian'));
ALTER TABLE "patient" ADD CONSTRAINT "patient_age_check" CHECK ("age_years" BETWEEN 0 AND 130);

-- Search (PAT-002): partial matches on name and phone use trigram indexes; exact lower(name) lookups use the btree.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "patient_name_lower_idx" ON "patient" ("tenant_id", lower("full_name"));
CREATE INDEX "patient_name_trgm_idx" ON "patient" USING gin (lower("full_name") gin_trgm_ops);
CREATE INDEX "patient_phone_trgm_idx" ON "patient" USING gin ("phone" gin_trgm_ops);
