-- ============================================================
-- #34 — Refonte de la taxonomie nails (nail_style v2)
-- ============================================================
--
-- L'ancienne liste (6 valeurs orientées « look ») est remplacée par une
-- taxonomie de 12 familles, partagée telle quelle entre :
--   - l'écran pro « Mes spécialités »            (les 12)
--   - l'écran style de l'onboarding client       (sous-ensemble de 6)
--   - le matching reco (pns.style_nails = ANY(client.styles)) — inchangé,
--     puisque les deux côtés utilisent désormais les mêmes slugs.
--
-- Mapping ancien -> nouveau (décidé avec le produit) :
--   nail_art        -> nail_art            (conservé)
--   french_nude     -> french
--   pose_resine     -> resine_acrylique
--   couleurs_vives  -> semi_permanent      ┐ fusion
--   vernis_gel      -> semi_permanent      ┘
--   autre           -> (supprimé — pas d'équivalent)
--
-- La base prod n'a pas (ou quasi pas) de données nail_style à ce stade
-- (onboarding client mobile pas encore publié, éditeur pro tout neuf), mais
-- la migration reste écrite pour être sûre sur des lignes existantes.
--
-- On recrée le type ENUM entièrement (rename + create) plutôt que ADD/DROP
-- VALUE : entièrement transactionnel, pas de contrainte "valeur inutilisable
-- dans la même transaction".

-- ── 1. Purge des lignes qui n'ont aucun équivalent ('autre') ─────────────────
DELETE FROM client_preferences
 WHERE style_nails = 'autre'
   AND COALESCE(array_length(styles, 1), 0) <= 1;

DELETE FROM pro_nail_styles WHERE style_nails = 'autre';

-- ── 2. Pré-dédup de pro_nail_styles (la fusion vers semi_permanent peut créer
--       deux lignes de PK identique (pro_id, style_nails)) ───────────────────
DELETE FROM pro_nail_styles a
 USING pro_nail_styles b
 WHERE a.ctid > b.ctid
   AND a.pro_id = b.pro_id
   AND (CASE a.style_nails::text
          WHEN 'french_nude'    THEN 'french'
          WHEN 'pose_resine'    THEN 'resine_acrylique'
          WHEN 'couleurs_vives' THEN 'semi_permanent'
          WHEN 'vernis_gel'     THEN 'semi_permanent'
          ELSE a.style_nails::text END)
     = (CASE b.style_nails::text
          WHEN 'french_nude'    THEN 'french'
          WHEN 'pose_resine'    THEN 'resine_acrylique'
          WHEN 'couleurs_vives' THEN 'semi_permanent'
          WHEN 'vernis_gel'     THEN 'semi_permanent'
          ELSE b.style_nails::text END);

-- ── 3. Recréation du type ───────────────────────────────────────────────────
ALTER TYPE nail_style RENAME TO nail_style__v1;

CREATE TYPE nail_style AS ENUM (
  'manucure_soin',
  'renforcement_ongle',
  'pose_gel',
  'resine_acrylique',
  'acrygel_polygel',
  'capsules_gelx',
  'semi_permanent',
  'french',
  'baby_boomer_ombre',
  'nail_art',
  'effets_finitions',
  'formes_sculptees'
);

-- ── 4. Bascule des colonnes ─────────────────────────────────────────────────
-- 4a. client_preferences.style_nails (scalaire, NOT NULL — 'autre' déjà purgé)
ALTER TABLE client_preferences
  ALTER COLUMN style_nails TYPE nail_style
  USING (CASE style_nails::text
           WHEN 'nail_art'       THEN 'nail_art'
           WHEN 'french_nude'    THEN 'french'
           WHEN 'pose_resine'    THEN 'resine_acrylique'
           WHEN 'couleurs_vives' THEN 'semi_permanent'
           WHEN 'vernis_gel'     THEN 'semi_permanent'
         END::nail_style);

-- 4b. client_preferences.styles (nail_style[], NOT NULL DEFAULT '{}')
--     remappe chaque élément, retire les 'autre', dédoublonne.
--     Postgres interdit une sous-requête dans l'expression USING d'un
--     ALTER COLUMN TYPE → on passe par une fonction jetable.
CREATE FUNCTION _mig_remap_nail_styles_v2(src text[]) RETURNS nail_style[]
  LANGUAGE sql IMMUTABLE AS $fn$
    SELECT COALESCE(array_agg(DISTINCT m ORDER BY m), '{}')::nail_style[]
      FROM (
        SELECT CASE e
                 WHEN 'nail_art'       THEN 'nail_art'
                 WHEN 'french_nude'    THEN 'french'
                 WHEN 'pose_resine'    THEN 'resine_acrylique'
                 WHEN 'couleurs_vives' THEN 'semi_permanent'
                 WHEN 'vernis_gel'     THEN 'semi_permanent'
                 ELSE NULL
               END AS m
          FROM unnest(src) AS e
      ) t
     WHERE m IS NOT NULL
  $fn$;

ALTER TABLE client_preferences ALTER COLUMN styles DROP DEFAULT;

ALTER TABLE client_preferences
  ALTER COLUMN styles TYPE nail_style[]
  USING _mig_remap_nail_styles_v2(styles::text[]);

ALTER TABLE client_preferences ALTER COLUMN styles SET DEFAULT '{}';

DROP FUNCTION _mig_remap_nail_styles_v2(text[]);

-- 4c. pro_nail_styles.style_nails (fait partie de la PK — dédup déjà faite)
ALTER TABLE pro_nail_styles
  ALTER COLUMN style_nails TYPE nail_style
  USING (CASE style_nails::text
           WHEN 'nail_art'       THEN 'nail_art'
           WHEN 'french_nude'    THEN 'french'
           WHEN 'pose_resine'    THEN 'resine_acrylique'
           WHEN 'couleurs_vives' THEN 'semi_permanent'
           WHEN 'vernis_gel'     THEN 'semi_permanent'
         END::nail_style);

-- ── 5. Nettoyage ────────────────────────────────────────────────────────────
DROP TYPE nail_style__v1;
