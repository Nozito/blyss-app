-- ============================================================
-- #34 — compteurs onboarding client pour l'inspection admin
-- ============================================================
--
-- L'écran admin « Voir l'onboarding » lit tout depuis la base. Les taps CTA et
-- les vues de la page recommandations sont sinon uniquement dans PostHog
-- (mobile) — on en garde un compteur serveur, incrémenté par les routes
-- /recommendations (GET) et /cta (POST).
--
-- Additif, défaut 0. `city` = ville/CP saisis à l'écran préférences (décision
-- produit #34).

ALTER TABLE client_onboarding
  ADD COLUMN IF NOT EXISTS recommendations_viewed INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cta_tapped             INT NOT NULL DEFAULT 0;

ALTER TABLE client_preferences
  ADD COLUMN IF NOT EXISTS city TEXT;
