-- ============================================================
-- Migration : marqueur MFA sur les refresh tokens (2FA admin obligatoire)
-- ============================================================
--
-- Un refresh token émis après vérification du second facteur
-- (POST /api/auth/2fa/verify) porte mfa = TRUE. Le endpoint /refresh propage
-- ce marqueur au nouveau token d'accès (claim `amr: ["mfa"]`) et au refresh
-- token de rotation, pour que la session reste « MFA » sur toute sa durée de
-- vie sans re-challenge à chaque rotation de 15 min.
--
-- Le middleware admin (requireAdminMiddleware) exige amr:["mfa"] sur les
-- routes /api/admin/* quand ADMIN_2FA_REQUIRED = true.
--
-- Additif, non destructif, défaut FALSE : les sessions existantes restent
-- valides et sont simplement considérées « non-MFA » (comportement voulu —
-- elles se re-authentifieront au prochain login).

ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS mfa BOOLEAN NOT NULL DEFAULT FALSE;
