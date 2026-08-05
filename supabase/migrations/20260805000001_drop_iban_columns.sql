-- Drop IBAN/bank-info self-service columns entirely.
-- Payouts are handled exclusively by Stripe Connect (users.stripe_account_id);
-- this app-side encrypted IBAN storage (mobile self-service form + admin
-- manual entry) is dead code as of 2026-08-05 and never fed real transfers.
-- Irreversible: this permanently deletes any encrypted IBAN/bank data still
-- stored on existing rows.

DROP INDEX IF EXISTS idx_users_iban_hash;

ALTER TABLE users
  DROP COLUMN IF EXISTS "IBAN",
  DROP COLUMN IF EXISTS iban_iv,
  DROP COLUMN IF EXISTS iban_tag,
  DROP COLUMN IF EXISTS iban_last4,
  DROP COLUMN IF EXISTS iban_hash,
  DROP COLUMN IF EXISTS bankaccountname,
  DROP COLUMN IF EXISTS bank_info_updated_at;
