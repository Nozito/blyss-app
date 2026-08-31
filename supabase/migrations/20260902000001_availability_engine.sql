-- ============================================================
-- Moteur de disponibilités — chantier 3 (3.2 / 3.3 / 3.4)
-- ============================================================
--
-- Objectif : donner au backend de quoi CALCULER les disponibilités d'une pro
-- côté serveur (aujourd'hui la logique vit dans le mobile, cf. audit 3.1) et
-- garantir l'anti-double-booking transactionnel (3.3) + l'ajout manuel pro
-- avec overrides audités (3.4).
--
-- Cette migration est NON DESTRUCTIVE : elle n'ajoute que des colonnes/tables,
-- toutes nullable ou avec DEFAULT, et backfille les réservations futures.
-- L'ancien modèle `slots` précréés reste intact et fonctionnel le temps de la
-- bascule (dépréciation dans une PR ultérieure).
--
-- HORS PÉRIMÈTRE (PR séparée, après bascule complète) :
--   contrainte EXCLUDE USING gist sur reservations — nécessite un script
--   d'audit préalable des chevauchements existants, ne pas l'ajouter à l'aveugle.

BEGIN;

-- ------------------------------------------------------------
-- 1. working_hours : horaires d'ouverture hebdomadaires de la pro
-- ------------------------------------------------------------
-- Plusieurs lignes possibles par jour (ex. 09:00–12:00 puis 14:00–18:00).
-- weekday : 0 = dimanche … 6 = samedi (compatible EXTRACT(DOW) de Postgres).
CREATE TABLE working_hours (
  id          SERIAL PRIMARY KEY,
  pro_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weekday     SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT working_hours_range_check CHECK (end_time > start_time)
);

CREATE INDEX idx_working_hours_pro_weekday ON working_hours(pro_id, weekday);

CREATE TRIGGER trg_working_hours_updated_at BEFORE UPDATE ON working_hours
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Autorisation 100 % applicative dans ce backend (clé service_role, RLS jamais
-- utilisée comme contrôle d'accès réel — cf. 20260807000002 et
-- 20260901000001). Pas de policy auth.uid() ici : ce backend ne crée jamais de
-- session Supabase Auth, auth.uid() serait toujours NULL et suggérerait à tort
-- un modèle d'accès par ligne qui n'existe pas. On réplique le même filet
-- deny-all de profondeur : RLS activée + privilèges révoqués.
ALTER TABLE working_hours ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON working_hours FROM anon, authenticated;

-- ------------------------------------------------------------
-- 2. prestations : paramètres de réservabilité
-- ------------------------------------------------------------
-- buffer_before_minutes complète buffer_after_minutes (ajouté en 20260412000002).
-- Règle additive (cf. design 3.2) : pour une réservation multi-prestations,
-- chaque prestation apporte ses deux buffers intégralement, cumulés bout à bout.
-- Les valeurs NULL de lead_time / horizon signifient « hériter du réglage pro ».
ALTER TABLE prestations
  ADD COLUMN IF NOT EXISTS buffer_before_minutes INT NOT NULL DEFAULT 0
    CHECK (buffer_before_minutes IN (0, 5, 10, 15, 20, 30)),
  ADD COLUMN IF NOT EXISTS booking_lead_time_minutes INT
    CHECK (booking_lead_time_minutes IS NULL OR booking_lead_time_minutes BETWEEN 0 AND 43200),
  ADD COLUMN IF NOT EXISTS booking_horizon_days INT
    CHECK (booking_horizon_days IS NULL OR booking_horizon_days BETWEEN 1 AND 365),
  ADD COLUMN IF NOT EXISTS is_online_bookable BOOLEAN NOT NULL DEFAULT TRUE;

-- ------------------------------------------------------------
-- 3. users (pro) : réglages de réservation par défaut + fuseau
-- ------------------------------------------------------------
-- Héritage résolu par une fonction partagée (cf. availability.service.ts) :
--   effectiveLeadTime = prestation.booking_lead_time_minutes
--                    ?? pro.default_booking_lead_time_minutes
--                    ?? 120
--   effectiveHorizon  = prestation.booking_horizon_days
--                    ?? pro.default_booking_horizon_days
--                    ?? 60
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS default_booking_lead_time_minutes INT
    CHECK (default_booking_lead_time_minutes IS NULL OR default_booking_lead_time_minutes BETWEEN 0 AND 43200),
  ADD COLUMN IF NOT EXISTS default_booking_horizon_days INT
    CHECK (default_booking_horizon_days IS NULL OR default_booking_horizon_days BETWEEN 1 AND 365),
  -- Fuseau IANA de l'activité de la pro. Tout le calcul de disponibilité se
  -- fait dans ce fuseau puis est sérialisé en TIMESTAMPTZ (jamais d'arithmétique
  -- sur des chaînes locales naïves — cf. tests DST du design 3.2).
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Europe/Paris';

-- ------------------------------------------------------------
-- 4. unavailabilities : granularité heure (rétrocompatible)
-- ------------------------------------------------------------
-- start_time / end_time NULL  = journée(s) entière(s) — comportement historique,
-- toutes les lignes existantes restent valides sans backfill.
-- start_time / end_time non NULL = créneau ponctuel (ex. pause déjeuner) ;
-- dans ce cas start_date doit être égal à end_date (une seule journée).
ALTER TABLE unavailabilities
  ADD COLUMN IF NOT EXISTS start_time TIME,
  ADD COLUMN IF NOT EXISTS end_time   TIME;

ALTER TABLE unavailabilities
  ADD CONSTRAINT unavailabilities_time_pair_check
    CHECK (
      (start_time IS NULL AND end_time IS NULL)
      OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
    ),
  ADD CONSTRAINT unavailabilities_time_single_day_check
    CHECK (start_time IS NULL OR start_date = end_date);

-- ------------------------------------------------------------
-- 5. reservations : SNAPSHOT de calcul (3.2)
-- ------------------------------------------------------------
-- Écrits UNE SEULE FOIS à la création (ou à l'acceptation d'un reschedule) et
-- JAMAIS recalculés si les réglages de la prestation changent ensuite. Le
-- moteur de disponibilité lit blocked_start/end_datetime — jamais la prestation.
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS service_duration_minutes INT,
  ADD COLUMN IF NOT EXISTS buffer_before_minutes    INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS buffer_after_minutes     INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS blocked_start_datetime   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS blocked_end_datetime     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS timezone                 TEXT NOT NULL DEFAULT 'Europe/Paris';

-- ------------------------------------------------------------
-- 6. reservations : audit des overrides manuels pro (3.4)
-- ------------------------------------------------------------
-- NULL manual_override_reason = réservation normale (aucun override).
-- 'outside_hours' = la pro a ajouté un RDV hors de ses horaires d'ouverture.
-- 'conflict'      = la pro a forcé un RDV malgré un chevauchement (dernier
--                   recours) ; motif libre obligatoire.
-- manual_override_conflicts : JSONB SANS PII — uniquement
--   { "reservation_ids": number[], "captured_at": "<iso>" }
-- (jamais de nom / téléphone / e-mail — minimisation RGPD). Un test dédié
-- vérifie que le contenu inséré est bien nettoyé.
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS manual_override_reason TEXT
    CHECK (manual_override_reason IS NULL OR manual_override_reason IN ('outside_hours', 'conflict')),
  ADD COLUMN IF NOT EXISTS manual_override_by_user_id INT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS manual_override_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS manual_override_note TEXT,
  ADD COLUMN IF NOT EXISTS manual_override_conflicts JSONB;

-- Cohérence : un override 'conflict' exige un motif ; toute ligne avec un
-- reason non NULL doit porter l'auteur et l'horodatage.
ALTER TABLE reservations
  ADD CONSTRAINT reservations_override_conflict_requires_note
    CHECK (manual_override_reason IS DISTINCT FROM 'conflict'
           OR (manual_override_note IS NOT NULL AND length(btrim(manual_override_note)) > 0)),
  ADD CONSTRAINT reservations_override_audit_complete
    CHECK (manual_override_reason IS NULL
           OR (manual_override_by_user_id IS NOT NULL AND manual_override_at IS NOT NULL));

-- ------------------------------------------------------------
-- 7. Index de lecture pour le moteur de disponibilité
-- ------------------------------------------------------------
-- getAvailability / checkSlotAvailability lisent les réservations bloquantes
-- d'une pro sur une fenêtre temporelle. status NOT IN ('cancelled') est le
-- filtre bloquant (cf. règle 4 du design 3.2).
CREATE INDEX idx_reservations_pro_blocked
  ON reservations(pro_id, status, blocked_start_datetime, blocked_end_datetime);

CREATE INDEX idx_unavailabilities_pro_range
  ON unavailabilities(pro_id, start_date, end_date);

-- ------------------------------------------------------------
-- 8. Backfill des réservations futures non finalisées
-- ------------------------------------------------------------
-- Idempotent (WHERE blocked_start_datetime IS NULL). À rejouer sans risque.
-- Pour l'historique on ne calcule que les RDV à venir : le moteur ne
-- s'intéresse pas au passé et un backfill global serait inutilement coûteux.
UPDATE reservations r
SET
  service_duration_minutes = GREATEST(
    1, ROUND(EXTRACT(EPOCH FROM (r.end_datetime - r.start_datetime)) / 60.0)::INT
  ),
  buffer_before_minutes = 0,
  buffer_after_minutes = COALESCE(p.buffer_after_minutes, 0),
  blocked_start_datetime = r.start_datetime,
  blocked_end_datetime = r.end_datetime
    + (COALESCE(p.buffer_after_minutes, 0) || ' minutes')::INTERVAL,
  timezone = COALESCE(pro.timezone, 'Europe/Paris')
FROM users pro
LEFT JOIN prestations p ON p.id = r.prestation_id
WHERE pro.id = r.pro_id
  AND r.blocked_start_datetime IS NULL
  AND r.status NOT IN ('cancelled', 'completed')
  AND r.end_datetime > NOW();

COMMIT;
