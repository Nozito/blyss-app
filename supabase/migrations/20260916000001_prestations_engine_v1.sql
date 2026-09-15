-- ============================================================
-- Moteur de prestations générique — V1 → V3 (architecture cible)
-- ============================================================
--
-- Réf : blyss-mobile/docs/ARCHITECTURE_MOTEUR_PRESTATIONS_V1_V3.md (§0, §2).
-- Pose le schéma COMPLET de la cible (V1 exposée, V2/V3 en réserve inerte) en
-- une seule migration, pour ne jamais avoir à refondre le schéma plus tard :
--   - V1 : pricing_mode/ordering_rank sur prestations, variant_groups,
--          variant_values, options, reservation_items + tables filles
--          variantes/options.
--   - V2 : questions, question_choices, reservation_item_answers — schéma
--          posé mais aucune UI/route ne les expose encore.
--   - V3 : reservation_items accepte déjà 1..N lignes par réservation ; rien
--          de plus à migrer quand le multi-prestations sera exposé.
--
-- NON DESTRUCTIVE : uniquement des ADD COLUMN / CREATE TABLE, toutes
-- nullable ou avec DEFAULT. Backfill non destructif en fin de migration
-- (une ligne reservation_items par réservation existante).

BEGIN;

-- ------------------------------------------------------------
-- 1. prestations : pricing_mode + ordering_rank
-- ------------------------------------------------------------
-- pricing_mode 'from' active l'affichage "à partir de" (doc §6) — sans effet
-- tant qu'aucun groupe de variante obligatoire n'existe (doc §6.4).
-- ordering_rank : tri du panier V3 (doc §10) — actif dès V1 même à 1 item.
ALTER TABLE prestations
  ADD COLUMN IF NOT EXISTS pricing_mode TEXT NOT NULL DEFAULT 'fixed'
    CHECK (pricing_mode IN ('fixed', 'from')),
  ADD COLUMN IF NOT EXISTS ordering_rank INT NOT NULL DEFAULT 10;

-- ------------------------------------------------------------
-- 2. variant_groups / variant_values (V1)
-- ------------------------------------------------------------
-- selection_mode modélisé dès V1 (doc §7.1) mais seul 'single' est
-- implémenté côté validation/UI — 'multi' reste une capacité de schéma en
-- réserve, sans migration nécessaire si le besoin apparaît un jour.
CREATE TABLE variant_groups (
  id             SERIAL PRIMARY KEY,
  prestation_id  INT NOT NULL REFERENCES prestations(id) ON DELETE CASCADE,
  name           VARCHAR(100) NOT NULL,
  required       BOOLEAN NOT NULL DEFAULT TRUE,
  selection_mode TEXT NOT NULL DEFAULT 'single' CHECK (selection_mode IN ('single', 'multi')),
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order     INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_variant_groups_prestation ON variant_groups(prestation_id);
CREATE TRIGGER trg_variant_groups_updated_at BEFORE UPDATE ON variant_groups
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
ALTER TABLE variant_groups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON variant_groups FROM anon, authenticated;

CREATE TABLE variant_values (
  id                SERIAL PRIMARY KEY,
  variant_group_id  INT NOT NULL REFERENCES variant_groups(id) ON DELETE CASCADE,
  label             VARCHAR(100) NOT NULL,
  price_delta       NUMERIC(10,2) NOT NULL DEFAULT 0,
  duration_delta    INT NOT NULL DEFAULT 0,
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order        INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_variant_values_group ON variant_values(variant_group_id);
CREATE TRIGGER trg_variant_values_updated_at BEFORE UPDATE ON variant_values
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
ALTER TABLE variant_values ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON variant_values FROM anon, authenticated;

-- ------------------------------------------------------------
-- 3. options (V1)
-- ------------------------------------------------------------
-- Pas d'exclusion mutuelle en V1 (doc §8, verrouillé) — sélection multiple
-- libre, aucune colonne de contrainte d'exclusion posée pour l'instant.
CREATE TABLE options (
  id             SERIAL PRIMARY KEY,
  prestation_id  INT NOT NULL REFERENCES prestations(id) ON DELETE CASCADE,
  name           VARCHAR(100) NOT NULL,
  price_delta    NUMERIC(10,2) NOT NULL DEFAULT 0,
  duration_delta INT NOT NULL DEFAULT 0,
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order     INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_options_prestation ON options(prestation_id);
CREATE TRIGGER trg_options_updated_at BEFORE UPDATE ON options
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
ALTER TABLE options ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON options FROM anon, authenticated;

-- ------------------------------------------------------------
-- 4. questions / question_choices (V2 — schéma posé, non exposé)
-- ------------------------------------------------------------
-- is_sensitive : garde-fou RGPD verrouillé (doc §9.2) — coché explicitement
-- par la pro ou suggéré par détection de mots-clés côté service, jamais
-- déduit automatiquement sans confirmation humaine.
CREATE TABLE questions (
  id             SERIAL PRIMARY KEY,
  prestation_id  INT NOT NULL REFERENCES prestations(id) ON DELETE CASCADE,
  label          VARCHAR(300) NOT NULL,
  type           TEXT NOT NULL CHECK (type IN ('short_text', 'long_text', 'boolean', 'single_choice', 'multi_choice')),
  required       BOOLEAN NOT NULL DEFAULT FALSE,
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  is_sensitive   BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order     INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_questions_prestation ON questions(prestation_id);
CREATE TRIGGER trg_questions_updated_at BEFORE UPDATE ON questions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON questions FROM anon, authenticated;

CREATE TABLE question_choices (
  id           SERIAL PRIMARY KEY,
  question_id  INT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  label        VARCHAR(200) NOT NULL,
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_question_choices_question ON question_choices(question_id);
CREATE TRIGGER trg_question_choices_updated_at BEFORE UPDATE ON question_choices
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
ALTER TABLE question_choices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON question_choices FROM anon, authenticated;

-- ------------------------------------------------------------
-- 5. reservation_items — table de jonction, dès V1 (doc §2.1)
-- ------------------------------------------------------------
-- 1 ligne par réservation en V1 (1 prestation par RDV, contrainte au niveau
-- applicatif, jamais SQL) ; N lignes dès que le multi-prestations (V3) sera
-- exposé — même table, aucune migration de structure nécessaire.
-- prestation_id nullable : une prestation supprimée ne doit jamais faire
-- disparaître l'historique (doc §18).
CREATE TABLE reservation_items (
  id                        SERIAL PRIMARY KEY,
  reservation_id            INT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  prestation_id             INT REFERENCES prestations(id) ON DELETE SET NULL,
  snapshot_name             VARCHAR(255) NOT NULL,
  snapshot_price            NUMERIC(10,2) NOT NULL,
  snapshot_duration_minutes INT NOT NULL,
  position                  INT NOT NULL DEFAULT 0,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_reservation_items_reservation ON reservation_items(reservation_id);
CREATE INDEX idx_reservation_items_prestation ON reservation_items(prestation_id);
ALTER TABLE reservation_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON reservation_items FROM anon, authenticated;

CREATE TABLE reservation_item_variants (
  id                       SERIAL PRIMARY KEY,
  reservation_item_id      INT NOT NULL REFERENCES reservation_items(id) ON DELETE CASCADE,
  variant_group_id         INT REFERENCES variant_groups(id) ON DELETE SET NULL,
  variant_value_id         INT REFERENCES variant_values(id) ON DELETE SET NULL,
  snapshot_group_name      VARCHAR(100) NOT NULL,
  snapshot_value_label     VARCHAR(100) NOT NULL,
  snapshot_price_delta     NUMERIC(10,2) NOT NULL DEFAULT 0,
  snapshot_duration_delta  INT NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_reservation_item_variants_item ON reservation_item_variants(reservation_item_id);
ALTER TABLE reservation_item_variants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON reservation_item_variants FROM anon, authenticated;

CREATE TABLE reservation_item_options (
  id                       SERIAL PRIMARY KEY,
  reservation_item_id      INT NOT NULL REFERENCES reservation_items(id) ON DELETE CASCADE,
  option_id                INT REFERENCES options(id) ON DELETE SET NULL,
  snapshot_name            VARCHAR(100) NOT NULL,
  snapshot_price_delta     NUMERIC(10,2) NOT NULL DEFAULT 0,
  snapshot_duration_delta  INT NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_reservation_item_options_item ON reservation_item_options(reservation_item_id);
ALTER TABLE reservation_item_options ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON reservation_item_options FROM anon, authenticated;

-- V2 — schéma posé, aucune route/UI ne l'alimente encore.
CREATE TABLE reservation_item_answers (
  id                          SERIAL PRIMARY KEY,
  reservation_item_id         INT NOT NULL REFERENCES reservation_items(id) ON DELETE CASCADE,
  question_id                 INT REFERENCES questions(id) ON DELETE SET NULL,
  snapshot_question_label     VARCHAR(300) NOT NULL,
  snapshot_question_type      TEXT NOT NULL,
  snapshot_is_sensitive       BOOLEAN NOT NULL DEFAULT FALSE,
  snapshot_choices_available  TEXT[],
  answer_value                TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_reservation_item_answers_item ON reservation_item_answers(reservation_item_id);
ALTER TABLE reservation_item_answers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON reservation_item_answers FROM anon, authenticated;

-- ------------------------------------------------------------
-- 6. Backfill non destructif — une ligne reservation_items par réservation
-- ------------------------------------------------------------
-- Idempotent (WHERE NOT EXISTS). Le nom recopié est celui ACTUEL de la
-- prestation : l'historique n'a jamais figé le nom avant cette migration
-- (bug documenté, doc §1.2/§3.4/§16.2) — limite acceptée, pas de perte de
-- donnée puisque cette information n'existait pas. `reservations` reste la
-- source de vérité legacy tant que dual-write actif (doc §16.3) ; ce backfill
-- ne fait que rattraper l'historique déjà existant pour reservation_items.
INSERT INTO reservation_items (
  reservation_id, prestation_id, snapshot_name, snapshot_price, snapshot_duration_minutes, position, created_at
)
SELECT
  r.id,
  r.prestation_id,
  COALESCE(p.name, 'Prestation supprimée'),
  r.price,
  COALESCE(
    r.service_duration_minutes,
    GREATEST(1, ROUND(EXTRACT(EPOCH FROM (r.end_datetime - r.start_datetime)) / 60.0)::INT)
  ),
  0,
  r.created_at
FROM reservations r
LEFT JOIN prestations p ON p.id = r.prestation_id
WHERE NOT EXISTS (SELECT 1 FROM reservation_items ri WHERE ri.reservation_id = r.id);

COMMIT;
