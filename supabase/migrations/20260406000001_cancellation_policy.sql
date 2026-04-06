-- ============================================================
-- Migration: Politique d'annulation par professionnel
-- Ajoute cancellation_notice_hours sur la table users
-- Valeurs autorisées : 0 (toujours), 2, 4, 6, 12, 24, 48, 72 heures
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS cancellation_notice_hours INT NOT NULL DEFAULT 24
    CONSTRAINT chk_cancellation_notice_hours
      CHECK (cancellation_notice_hours IN (0, 2, 4, 6, 12, 24, 48, 72));

COMMENT ON COLUMN users.cancellation_notice_hours IS
  'Délai minimum (heures) avant le RDV pour autoriser une annulation client. '
  '0 = annulation toujours possible. Applicable uniquement aux pros.';
