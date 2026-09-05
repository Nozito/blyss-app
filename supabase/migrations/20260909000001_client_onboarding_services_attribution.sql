-- ============================================================
-- #34 passe 3b — services voulus, attribution, favoris pro
-- ============================================================
--
-- L'onboarding client passe de 5 à 7 écrans (ajout « comment ça marche »,
-- notifications, « comment tu as connu Blyss ») et l'écran préférences gagne
-- un 2e axe : la prestation voulue (multi), distincte du style (goût).
--
-- Tout est additif. Le mobile appelle /follow et /attribution en best-effort :
-- pas de régression si cette migration n'est pas encore déployée.

-- 1. current_step étendu à 0..7
ALTER TABLE client_onboarding DROP CONSTRAINT IF EXISTS client_onboarding_current_step_check;
ALTER TABLE client_onboarding
  ADD CONSTRAINT client_onboarding_current_step_check CHECK (current_step BETWEEN 0 AND 7);

-- 2. prestation(s) voulue(s) — axe distinct du style. Valeurs contrôlées côté
--    route (middleware/validate onboardingPreferencesSchema) : nouvelle_pose,
--    remplissage, depose, semi_permanent, capsules, soin_pieds.
ALTER TABLE client_preferences
  ADD COLUMN IF NOT EXISTS services TEXT[] NOT NULL DEFAULT '{}';

-- 3. « Comment tu as connu Blyss » (écran 7) + compteur favoris pour l'admin
ALTER TABLE client_onboarding
  ADD COLUMN IF NOT EXISTS acquisition_source TEXT,
  ADD COLUMN IF NOT EXISTS pros_followed      INT NOT NULL DEFAULT 0;

-- 4. favoris pro capturés pendant l'onboarding (persistants — la cliente les
--    retrouve dans l'app). PK composite = idempotent.
CREATE TABLE IF NOT EXISTS client_followed_pros (
  client_id  INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pro_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (client_id, pro_id)
);
CREATE INDEX IF NOT EXISTS idx_client_followed_pros_client ON client_followed_pros (client_id);

ALTER TABLE client_followed_pros ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE client_followed_pros FROM anon, authenticated;
