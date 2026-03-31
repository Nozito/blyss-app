-- RGPD: colonnes pour rétention des données et limitation du traitement
-- Exécuter via : npm run db:push ou scripts/db.mjs

-- Colonne : date de dernière connexion (pour calcul inactivité)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ DEFAULT NOW();

-- Colonne : date d'envoi du préavis de suppression (RGPD rétention)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS retention_notice_sent_at TIMESTAMPTZ;

-- Colonne : restriction du traitement (RGPD Art. 18 droit à la limitation)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_restricted BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS restricted_at TIMESTAMPTZ;

-- Table : journal d'audit pour les opérations de rétention RGPD
CREATE TABLE IF NOT EXISTS audit_log (
  id           BIGSERIAL PRIMARY KEY,
  operation    TEXT NOT NULL,
  rows_affected INTEGER NOT NULL DEFAULT 0,
  executed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mettre à jour last_login_at à chaque connexion réussie
-- (À déclencher depuis auth.routes.ts après bcrypt.compare réussi)
-- INSERT trigger ou UPDATE dans le handler login

-- Index pour le cron de rétention
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users (last_login_at);
CREATE INDEX IF NOT EXISTS idx_users_retention_notice ON users (retention_notice_sent_at);
