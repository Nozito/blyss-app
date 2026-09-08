-- ============================================================
-- Retrait de la 2FA TOTP admin (chantier #21 abandonné)
-- ============================================================
--
-- La fonctionnalité 2FA admin (TOTP + codes de secours + flag
-- ADMIN_2FA_REQUIRED) est entièrement retirée du code. On supprime les
-- colonnes devenues mortes.
--
-- ⚠️ Déployer le CODE (qui ne lit/écrit plus ces colonnes) AVANT d'appliquer
--    cette migration. `IF EXISTS` rend l'opération rejouable et tolérante à un
--    ordre inversé (le code planterait brièvement sur un SELECT si la migration
--    passe en premier).

BEGIN;

ALTER TABLE users
  DROP COLUMN IF EXISTS totp_enabled,
  DROP COLUMN IF EXISTS totp_secret_encrypted,
  DROP COLUMN IF EXISTS totp_secret_iv,
  DROP COLUMN IF EXISTS totp_backup_codes;

ALTER TABLE refresh_tokens
  DROP COLUMN IF EXISTS mfa;

COMMIT;
