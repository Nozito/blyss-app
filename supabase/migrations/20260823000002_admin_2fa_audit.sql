-- ============================================================
-- Migration : 2FA TOTP admin, verrouillage anti-bruteforce, audit log
-- ============================================================

-- Verrouillage après échecs répétés — vérifié uniquement pour les comptes
-- is_admin=TRUE (voir backend/routes/auth.routes.ts).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS failed_admin_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS admin_locked_until TIMESTAMPTZ;

-- 2FA TOTP — secret chiffré (AES-256-GCM, voir backend/lib/totp.ts),
-- jamais stocké en clair. Codes de secours hashés (bcrypt), un seul usage
-- chacun (retirés du tableau après consommation).
-- totp_backup_codes est en JSONB (pas TEXT[]) : le wrapper backend/lib/db.ts
-- sérialise les tableaux de params en JSON, incompatible avec la syntaxe
-- littérale des tableaux Postgres natifs.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS totp_secret_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS totp_secret_iv TEXT,
  ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS totp_backup_codes JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Journal des actions admin sensibles (grant/revoke admin, suppression
-- utilisateur, remboursement...). Lecture via GET /api/admin/audit-log.
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          BIGSERIAL PRIMARY KEY,
  actor_id    INT REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  metadata    JSONB,
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON admin_audit_log(created_at DESC);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
