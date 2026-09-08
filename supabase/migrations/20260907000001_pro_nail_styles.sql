-- ============================================================
-- #34 PR 3 — Taxonomie pro : styles nails déclarés par la pro
-- ============================================================
--
-- La table pro_nail_styles et l'enum nail_style existent déjà (migration
-- 20260906000001, créés vides). Cette migration :
--   1. renomme 3 valeurs de l'enum pour coller aux décisions produit
--      french         -> french_nude
--      gel            -> vernis_gel
--      resine         -> pose_resine
--   2. (la table pro_nail_styles est déjà au bon schéma : PK (pro_id,
--      style_nails), FK users(id) ON DELETE CASCADE, index sur pro_id via la
--      PK. On garde `style_nails` comme nom de colonne, cohérent avec
--      client_preferences ; le ticket proposait `style` + un id UUID, non
--      retenu — users.id est INT et la PK composite suffit.)
--
-- Aucune donnée en base (onboarding non déployé) → renommage sans migration
-- de lignes. RENAME VALUE est transactionnel (PG 12+).

ALTER TYPE nail_style RENAME VALUE 'french' TO 'french_nude';
ALTER TYPE nail_style RENAME VALUE 'gel'    TO 'vernis_gel';
ALTER TYPE nail_style RENAME VALUE 'resine' TO 'pose_resine';

-- Index explicite sur pro_id (la PK (pro_id, style_nails) le couvre déjà en
-- préfixe, mais on le rend explicite pour les lectures "styles d'une pro").
CREATE INDEX IF NOT EXISTS idx_pro_nail_styles_pro ON pro_nail_styles (pro_id);

-- #34 décision 6 — onboarding skippable. `skipped_at` non nul + `completed_at`
-- nul = passé, reprenable depuis les paramètres.
ALTER TABLE client_onboarding
  ADD COLUMN IF NOT EXISTS skipped_at TIMESTAMPTZ;
