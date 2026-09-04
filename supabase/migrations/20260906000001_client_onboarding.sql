-- ============================================================
-- #34 — Onboarding client nails : préférences, progression, taxonomie pro
-- ============================================================
--
-- Le ticket proposait 3 tables (client_preferences, client_onboarding_step,
-- client_onboarding_completed_at). client_onboarding_completed_at = un
-- timestamp, pas une table → fusionné dans client_onboarding. On garde donc :
--   - client_preferences  : le style nails choisi (1 ligne / client, évolutif)
--   - client_onboarding   : l'état de progression (1 ligne / client)
--   - pro_nail_styles     : taxonomie côté pro pour la reco (créée vide —
--                           l'éditeur pro est un lot séparé, cf.
--                           docs/DESIGN_34_client-onboarding.md)
--
-- Tout est additif. RLS activée + REVOKE (cohérent avec les autres tables
-- client, cf. 20260807000002).

-- Styles reconnus (ticket #34). 'autre' = fourre-tout.
DO $$ BEGIN
  CREATE TYPE nail_style AS ENUM ('nail_art', 'french', 'couleurs_vives', 'gel', 'resine', 'autre');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS client_preferences (
  client_id   INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  style_nails  nail_style NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS client_onboarding (
  client_id     INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- 0 = pas commencé … 5 = carousel features vu. completed_at figé quand
  -- l'onboarding est terminé (POST /complete) ou explicitement passé.
  current_step  SMALLINT NOT NULL DEFAULT 0 CHECK (current_step BETWEEN 0 AND 5),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  -- suivi des relances push J+1 / J+3 / J+7 (cron/onboarding-nudge.ts)
  nudge_d1_sent TIMESTAMPTZ,
  nudge_d3_sent TIMESTAMPTZ,
  nudge_d7_sent TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_client_onboarding_incomplete
  ON client_onboarding (started_at)
  WHERE completed_at IS NULL;

-- Taxonomie pro (vide pour l'instant). La reco LEFT JOIN cette table : tant
-- qu'aucune ligne n'existe, le style ne filtre pas — il est seulement stocké
-- et ré-affiché. Éditeur pro = lot séparé (#34 travail pro).
CREATE TABLE IF NOT EXISTS pro_nail_styles (
  pro_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  style_nails  nail_style NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (pro_id, style_nails)
);

CREATE TRIGGER trg_client_preferences_updated_at
  BEFORE UPDATE ON client_preferences
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE client_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_onboarding  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pro_nail_styles     ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE client_preferences, client_onboarding, pro_nail_styles FROM anon, authenticated;
