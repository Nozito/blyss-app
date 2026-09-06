-- ============================================================
-- #34 passe 3b — style multi-choix + attribution
-- ============================================================
--
-- L'onboarding client passe de 5 à 7 écrans (ajout « comment ça marche »,
-- notifications, « comment tu as connu Blyss » ; CTA déplacé en dernier).
-- L'écran préférences : le style devient **multi-choix**. Pas de nouvel axe
-- « prestation », pas de nouvelle notion de favori — le ♥ des recos réutilise
-- la table `favorites` existante.
--
-- Tout est additif. Le mobile appelle /attribution en best-effort : pas de
-- régression si cette migration n'est pas encore déployée.

-- 1. current_step étendu à 0..7
ALTER TABLE client_onboarding DROP CONSTRAINT IF EXISTS client_onboarding_current_step_check;
ALTER TABLE client_onboarding
  ADD CONSTRAINT client_onboarding_current_step_check CHECK (current_step BETWEEN 0 AND 7);

-- 2. style(s) — multi-choix. `style_nails` (singulier, migration 20260906000001)
--    est conservé = styles[0] (« style principal ») pour la reco et l'admin qui
--    le lisent déjà ; `styles` porte la liste complète.
ALTER TABLE client_preferences
  ADD COLUMN IF NOT EXISTS styles nail_style[] NOT NULL DEFAULT '{}';

-- 3. « Comment tu as connu Blyss » (écran 7)
ALTER TABLE client_onboarding
  ADD COLUMN IF NOT EXISTS acquisition_source TEXT;
