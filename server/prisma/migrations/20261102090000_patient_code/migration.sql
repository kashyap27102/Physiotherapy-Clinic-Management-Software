-- Optional extra patient ID set by the doctor or clinic, unique within a clinic (NULLs do not clash).
ALTER TABLE "patient" ADD COLUMN "patient_code" TEXT;
CREATE UNIQUE INDEX "patient_tenant_id_patient_code_key" ON "patient"("tenant_id", "patient_code");
