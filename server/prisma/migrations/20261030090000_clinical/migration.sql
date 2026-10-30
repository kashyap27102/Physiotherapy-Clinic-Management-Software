-- CLN-001 to CLN-004: episodes, assessments and treatment plans.

-- CreateTable
CREATE TABLE "episode" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "started_branch_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "discharged_at" TIMESTAMPTZ(6),
    "discharge_note" TEXT,
    "discharged_by" UUID,

    CONSTRAINT "episode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "episode_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "history" TEXT,
    "pain" TEXT,
    "range_of_motion" TEXT,
    "diagnosis" TEXT,
    "extra_fields" JSONB NOT NULL DEFAULT '{}',
    "author_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_plan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "episode_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "diagnosis" TEXT,
    "goals" TEXT,
    "planned_sessions" INTEGER,
    "frequency" TEXT,
    "therapy_types" TEXT,
    "estimated_cost" DECIMAL(12,2),
    "notes" TEXT,
    "author_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treatment_plan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "episode_tenant_id_id_key" ON "episode"("tenant_id", "id");
CREATE INDEX "episode_tenant_id_patient_id_started_at_idx" ON "episode"("tenant_id", "patient_id", "started_at" DESC);
CREATE UNIQUE INDEX "assessment_episode_id_version_key" ON "assessment"("episode_id", "version");
CREATE INDEX "assessment_tenant_id_episode_id_idx" ON "assessment"("tenant_id", "episode_id");
CREATE UNIQUE INDEX "treatment_plan_episode_id_version_key" ON "treatment_plan"("episode_id", "version");
CREATE INDEX "treatment_plan_tenant_id_episode_id_idx" ON "treatment_plan"("tenant_id", "episode_id");

-- One active episode per patient (CON-11, BR-CLN-2): the database refuses a second one even under a race.
CREATE UNIQUE INDEX "episode_one_active_per_patient_idx" ON "episode" ("patient_id") WHERE "status" = 'active';

-- AddForeignKey: composite keys make it impossible to link a row to another clinic's parent (ER 5.2).
ALTER TABLE "episode" ADD CONSTRAINT "episode_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "episode" ADD CONSTRAINT "episode_tenant_id_patient_id_fkey" FOREIGN KEY ("tenant_id", "patient_id") REFERENCES "patient"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "episode" ADD CONSTRAINT "episode_tenant_id_started_branch_id_fkey" FOREIGN KEY ("tenant_id", "started_branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "episode" ADD CONSTRAINT "episode_tenant_id_discharged_by_fkey" FOREIGN KEY ("tenant_id", "discharged_by") REFERENCES "user_account"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_tenant_id_episode_id_fkey" FOREIGN KEY ("tenant_id", "episode_id") REFERENCES "episode"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_tenant_id_author_id_fkey" FOREIGN KEY ("tenant_id", "author_id") REFERENCES "user_account"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "treatment_plan" ADD CONSTRAINT "treatment_plan_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "treatment_plan" ADD CONSTRAINT "treatment_plan_tenant_id_episode_id_fkey" FOREIGN KEY ("tenant_id", "episode_id") REFERENCES "episode"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "treatment_plan" ADD CONSTRAINT "treatment_plan_tenant_id_author_id_fkey" FOREIGN KEY ("tenant_id", "author_id") REFERENCES "user_account"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enums as text with CHECK constraints (ER section 1) and value rules.
ALTER TABLE "episode" ADD CONSTRAINT "episode_status_check" CHECK ("status" IN ('active', 'discharged'));
ALTER TABLE "episode" ADD CONSTRAINT "episode_discharge_check" CHECK (
  ("status" = 'active' AND "discharged_at" IS NULL AND "discharged_by" IS NULL)
  OR ("status" = 'discharged' AND "discharged_at" IS NOT NULL AND "discharged_by" IS NOT NULL)
);
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_version_check" CHECK ("version" >= 1);
ALTER TABLE "treatment_plan" ADD CONSTRAINT "treatment_plan_version_check" CHECK ("version" >= 1);
ALTER TABLE "treatment_plan" ADD CONSTRAINT "treatment_plan_planned_sessions_check" CHECK ("planned_sessions" IS NULL OR "planned_sessions" >= 1);
ALTER TABLE "treatment_plan" ADD CONSTRAINT "treatment_plan_estimated_cost_check" CHECK ("estimated_cost" IS NULL OR "estimated_cost" >= 0);

-- Versioned clinical rows are never changed or removed (BR-CLN-4, SEC-008): a trigger refuses UPDATE and DELETE for
-- every database role, so a bug in the application cannot rewrite history.
CREATE FUNCTION "refuse_clinical_history_change"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "assessment_append_only" BEFORE UPDATE OR DELETE ON "assessment"
  FOR EACH ROW EXECUTE FUNCTION "refuse_clinical_history_change"();
CREATE TRIGGER "treatment_plan_append_only" BEFORE UPDATE OR DELETE ON "treatment_plan"
  FOR EACH ROW EXECUTE FUNCTION "refuse_clinical_history_change"();
