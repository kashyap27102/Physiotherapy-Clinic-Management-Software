-- CON-05, tightened: in SQL a CHECK passes when it evaluates to NULL, so a payment with no method slipped through
-- ("NULL IN (...)" is NULL, not false). Spell out that payments and refunds must have a method.
ALTER TABLE "ledger_entry" DROP CONSTRAINT "ledger_entry_method_check";
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_method_check" CHECK (
  ("entry_type" IN ('PAYMENT', 'REFUND') AND "payment_method" IS NOT NULL AND "payment_method" IN ('cash', 'upi', 'card', 'bank_transfer'))
  OR ("entry_type" IN ('CHARGE', 'REVERSAL') AND "payment_method" IS NULL)
);
