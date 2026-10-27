-- TEN-001: clinic logo, one small image per clinic stored in the database (no file storage service yet, OQ-5).
CREATE TABLE "tenant_logo" (
    "tenant_id" UUID NOT NULL,
    "content_type" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_logo_pkey" PRIMARY KEY ("tenant_id")
);

ALTER TABLE "tenant_logo" ADD CONSTRAINT "tenant_logo_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep logos small; the API also enforces 200 KB.
ALTER TABLE "tenant_logo" ADD CONSTRAINT "tenant_logo_size_check" CHECK (octet_length("data") <= 204800);
ALTER TABLE "tenant_logo" ADD CONSTRAINT "tenant_logo_type_check"
  CHECK ("content_type" IN ('image/png', 'image/jpeg', 'image/webp'));
