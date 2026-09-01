-- ============================================================
-- Chantier 4.6 — contrainte anti-chevauchement sur reservations
-- ============================================================
--
-- Backstop base de données contre le double-booking, complémentaire du verrou
-- applicatif (pg_advisory_xact_lock + re-check dans reservation.service.ts) :
-- même si un futur endpoint contournait le service, Postgres refuse l'INSERT.
--
-- Prédicat :
--   - status IN ('confirmed','pending') : on ne contraint PAS l'historique
--     (`completed`) ni les annulations. Les données de seed / bookings passés
--     back-to-back avec buffers rétro-appliqués créent des chevauchements
--     légitimes qu'il ne faut pas bloquer rétroactivement.
--   - blocked_start_datetime IS NOT NULL : le snapshot 3.2 n'a backfillé que le
--     futur ; les lignes sans snapshot ne sont pas couvertes (acceptable).
--   - manual_override_reason IS DISTINCT FROM 'conflict' : l'override B (3.4)
--     crée VOLONTAIREMENT un chevauchement, tracé et assumé par la pro.
--
-- ⚠️ PRÉ-REQUIS AVANT APPLICATION (cf. backend/audit-slots-and-overlaps.ts) :
--   1. Zéro paire en chevauchement parmi (confirmed|pending, hors 'conflict').
--      Au moment de l'écriture, la fixture `sophie.pro@blyss.dev` en contient
--      ~49 → nettoyer la fixture (seed-sophie-pro.sql) et re-seeder, ou annuler
--      manuellement les doublons, AVANT `db.mjs push`.
--   2. Aucune réservation à venir sans blocked_start_datetime.

BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE reservations
  ADD CONSTRAINT reservations_no_overlap
  EXCLUDE USING gist (
    pro_id WITH =,
    tstzrange(blocked_start_datetime, blocked_end_datetime) WITH &&
  )
  WHERE (
    status IN ('confirmed', 'pending')
    AND blocked_start_datetime IS NOT NULL
    AND manual_override_reason IS DISTINCT FROM 'conflict'
  );

COMMIT;
