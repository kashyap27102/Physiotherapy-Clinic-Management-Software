-- VIS-001 to VIS-003 and BILL-001 to BILL-008: visits, session notes, default fee, ledger, documents, idempotency.

-- AlterTable
ALTER TABLE "patient" ADD COLUMN     "ledger_revision" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "visit" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "episode_id" UUID NOT NULL,
    "therapist_id" UUID,
    "visited_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fee_amount" DECIMAL(12,2) NOT NULL,
    "fee_override_reason" TEXT,
    "marked_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_note" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "note_text" TEXT NOT NULL,
    "author_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_setting" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "default_fee" DECIMAL(12,2) NOT NULL,
    "effective_from" DATE NOT NULL,
    "set_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entry" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "episode_id" UUID,
    "visit_id" UUID,
    "reverses_entry_id" UUID,
    "entry_type" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_method" TEXT,
    "reference" TEXT,
    "reason" TEXT,
    "entry_date" DATE NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_document" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "ledger_entry_id" UUID,
    "doc_type" TEXT NOT NULL,
    "financial_year" TEXT NOT NULL,
    "seq_no" INTEGER NOT NULL,
    "doc_number" TEXT NOT NULL,
    "lines_snapshot" JSONB,
    "period_from" DATE,
    "period_to" DATE,
    "issued_by" UUID NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "number_sequence" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "doc_type" TEXT NOT NULL,
    "financial_year" TEXT NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "number_sequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_key" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_status" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_key_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "visit_tenant_id_branch_id_visited_at_idx" ON "visit"("tenant_id", "branch_id", "visited_at" DESC);

-- CreateIndex
CREATE INDEX "visit_patient_id_visited_at_idx" ON "visit"("patient_id", "visited_at" DESC);

-- CreateIndex
CREATE INDEX "visit_episode_id_visited_at_idx" ON "visit"("episode_id", "visited_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "visit_tenant_id_id_key" ON "visit"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "session_note_tenant_id_visit_id_idx" ON "session_note"("tenant_id", "visit_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_note_visit_id_version_key" ON "session_note"("visit_id", "version");

-- CreateIndex
CREATE INDEX "fee_setting_tenant_id_created_at_idx" ON "fee_setting"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ledger_entry_patient_id_created_at_idx" ON "ledger_entry"("patient_id", "created_at");

-- CreateIndex
CREATE INDEX "ledger_entry_tenant_id_branch_id_entry_date_entry_type_idx" ON "ledger_entry"("tenant_id", "branch_id", "entry_date", "entry_type");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entry_tenant_id_id_key" ON "ledger_entry"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entry_tenant_id_reverses_entry_id_key" ON "ledger_entry"("tenant_id", "reverses_entry_id");

-- CreateIndex
CREATE INDEX "billing_document_patient_id_issued_at_idx" ON "billing_document"("patient_id", "issued_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "billing_document_tenant_id_id_key" ON "billing_document"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_document_branch_id_doc_type_financial_year_seq_no_key" ON "billing_document"("branch_id", "doc_type", "financial_year", "seq_no");

-- CreateIndex
CREATE UNIQUE INDEX "billing_document_tenant_id_doc_number_key" ON "billing_document"("tenant_id", "doc_number");

-- CreateIndex
CREATE UNIQUE INDEX "number_sequence_branch_id_doc_type_financial_year_key" ON "number_sequence"("branch_id", "doc_type", "financial_year");

-- CreateIndex
CREATE INDEX "idempotency_key_created_at_idx" ON "idempotency_key"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_key_tenant_id_user_id_key_key" ON "idempotency_key"("tenant_id", "user_id", "key");

-- AddForeignKey
ALTER TABLE "visit" ADD CONSTRAINT "visit_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit" ADD CONSTRAINT "visit_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit" ADD CONSTRAINT "visit_tenant_id_patient_id_fkey" FOREIGN KEY ("tenant_id", "patient_id") REFERENCES "patient"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit" ADD CONSTRAINT "visit_tenant_id_episode_id_fkey" FOREIGN KEY ("tenant_id", "episode_id") REFERENCES "episode"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit" ADD CONSTRAINT "visit_tenant_id_therapist_id_fkey" FOREIGN KEY ("tenant_id", "therapist_id") REFERENCES "user_account"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit" ADD CONSTRAINT "visit_tenant_id_marked_by_fkey" FOREIGN KEY ("tenant_id", "marked_by") REFERENCES "user_account"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_note" ADD CONSTRAINT "session_note_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_note" ADD CONSTRAINT "session_note_tenant_id_visit_id_fkey" FOREIGN KEY ("tenant_id", "visit_id") REFERENCES "visit"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_note" ADD CONSTRAINT "session_note_tenant_id_author_id_fkey" FOREIGN KEY ("tenant_id", "author_id") REFERENCES "user_account"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_setting" ADD CONSTRAINT "fee_setting_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_setting" ADD CONSTRAINT "fee_setting_tenant_id_set_by_fkey" FOREIGN KEY ("tenant_id", "set_by") REFERENCES "user_account"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_tenant_id_patient_id_fkey" FOREIGN KEY ("tenant_id", "patient_id") REFERENCES "patient"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_tenant_id_episode_id_fkey" FOREIGN KEY ("tenant_id", "episode_id") REFERENCES "episode"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_tenant_id_visit_id_fkey" FOREIGN KEY ("tenant_id", "visit_id") REFERENCES "visit"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_tenant_id_created_by_fkey" FOREIGN KEY ("tenant_id", "created_by") REFERENCES "user_account"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_tenant_id_reverses_entry_id_fkey" FOREIGN KEY ("tenant_id", "reverses_entry_id") REFERENCES "ledger_entry"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_document" ADD CONSTRAINT "billing_document_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_document" ADD CONSTRAINT "billing_document_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_document" ADD CONSTRAINT "billing_document_tenant_id_patient_id_fkey" FOREIGN KEY ("tenant_id", "patient_id") REFERENCES "patient"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_document" ADD CONSTRAINT "billing_document_tenant_id_ledger_entry_id_fkey" FOREIGN KEY ("tenant_id", "ledger_entry_id") REFERENCES "ledger_entry"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_document" ADD CONSTRAINT "billing_document_tenant_id_issued_by_fkey" FOREIGN KEY ("tenant_id", "issued_by") REFERENCES "user_account"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "number_sequence" ADD CONSTRAINT "number_sequence_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "number_sequence" ADD CONSTRAINT "number_sequence_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_key" ADD CONSTRAINT "idempotency_key_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Value rules (ER section 5.1). Enums are text with CHECK constraints (ER section 1).
ALTER TABLE "visit" ADD CONSTRAINT "visit_fee_check" CHECK ("fee_amount" >= 0);
ALTER TABLE "session_note" ADD CONSTRAINT "session_note_version_check" CHECK ("version" >= 1);
ALTER TABLE "session_note" ADD CONSTRAINT "session_note_text_check" CHECK (length(btrim("note_text")) > 0);
ALTER TABLE "fee_setting" ADD CONSTRAINT "fee_setting_fee_check" CHECK ("default_fee" >= 0);
ALTER TABLE "number_sequence" ADD CONSTRAINT "number_sequence_last_number_check" CHECK ("last_number" >= 0);
ALTER TABLE "number_sequence" ADD CONSTRAINT "number_sequence_doc_type_check" CHECK ("doc_type" IN ('RECEIPT', 'REVERSAL_RECEIPT', 'INVOICE'));
ALTER TABLE "billing_document" ADD CONSTRAINT "billing_document_doc_type_check" CHECK ("doc_type" IN ('RECEIPT', 'REVERSAL_RECEIPT', 'INVOICE'));
ALTER TABLE "billing_document" ADD CONSTRAINT "billing_document_seq_check" CHECK ("seq_no" >= 1);
-- Only a period invoice may have no ledger entry (DD-10).
ALTER TABLE "billing_document" ADD CONSTRAINT "billing_document_entry_check" CHECK ("doc_type" = 'INVOICE' OR "ledger_entry_id" IS NOT NULL);

ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_type_check" CHECK ("entry_type" IN ('CHARGE', 'PAYMENT', 'REFUND', 'REVERSAL'));
-- CON-01: never negative; a payment or refund is above zero; a zero-fee visit still has a charge row (DD-2).
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_amount_check" CHECK (
  "amount" >= 0 AND ("entry_type" NOT IN ('PAYMENT', 'REFUND') OR "amount" > 0)
);
-- CON-02, CON-03: a charge belongs to a visit and a reversal to the entry it cancels.
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_links_check" CHECK (
  ("entry_type" = 'CHARGE' AND "visit_id" IS NOT NULL AND "reverses_entry_id" IS NULL)
  OR ("entry_type" = 'REVERSAL' AND "reverses_entry_id" IS NOT NULL)
  OR ("entry_type" IN ('PAYMENT', 'REFUND') AND "reverses_entry_id" IS NULL)
);
-- CON-05: payments and refunds say how the money moved; refunds and reversals say why.
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_method_check" CHECK (
  ("entry_type" IN ('PAYMENT', 'REFUND') AND "payment_method" IN ('cash', 'upi', 'card', 'bank_transfer'))
  OR ("entry_type" IN ('CHARGE', 'REVERSAL') AND "payment_method" IS NULL)
);
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_reason_check" CHECK (
  "entry_type" NOT IN ('REFUND', 'REVERSAL') OR length(btrim(coalesce("reason", ''))) > 0
);
-- CON-02: one charge per visit.
CREATE UNIQUE INDEX "ledger_entry_one_charge_per_visit_idx" ON "ledger_entry" ("visit_id") WHERE "entry_type" = 'CHARGE';

-- CON-04: a reversal cancels one real entry of the same patient and the same amount, and never another reversal.
CREATE FUNCTION "check_ledger_reversal"() RETURNS trigger AS $$
DECLARE target RECORD;
BEGIN
  IF NEW."entry_type" <> 'REVERSAL' THEN RETURN NEW; END IF;
  SELECT "entry_type", "patient_id", "amount" INTO target
    FROM "ledger_entry" WHERE "tenant_id" = NEW."tenant_id" AND "id" = NEW."reverses_entry_id";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'a reversal needs an existing entry' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF target."entry_type" = 'REVERSAL' THEN
    RAISE EXCEPTION 'a reversal cannot be reversed' USING ERRCODE = 'check_violation';
  END IF;
  IF target."patient_id" <> NEW."patient_id" OR target."amount" <> NEW."amount" THEN
    RAISE EXCEPTION 'a reversal must match the entry it cancels' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ledger_entry_reversal_rules" BEFORE INSERT ON "ledger_entry"
  FOR EACH ROW EXECUTE FUNCTION "check_ledger_reversal"();

-- Money, attendance, notes, fees and documents are never changed or removed (BR-BILL-4, SEC-008): the same trigger
-- function the clinical history uses refuses UPDATE and DELETE for every database role.
CREATE TRIGGER "visit_append_only" BEFORE UPDATE OR DELETE ON "visit"
  FOR EACH ROW EXECUTE FUNCTION "refuse_clinical_history_change"();
CREATE TRIGGER "session_note_append_only" BEFORE UPDATE OR DELETE ON "session_note"
  FOR EACH ROW EXECUTE FUNCTION "refuse_clinical_history_change"();
CREATE TRIGGER "fee_setting_append_only" BEFORE UPDATE OR DELETE ON "fee_setting"
  FOR EACH ROW EXECUTE FUNCTION "refuse_clinical_history_change"();
CREATE TRIGGER "ledger_entry_append_only" BEFORE UPDATE OR DELETE ON "ledger_entry"
  FOR EACH ROW EXECUTE FUNCTION "refuse_clinical_history_change"();
CREATE TRIGGER "billing_document_append_only" BEFORE UPDATE OR DELETE ON "billing_document"
  FOR EACH ROW EXECUTE FUNCTION "refuse_clinical_history_change"();
