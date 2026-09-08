-- ============================================================
-- Chantier 4.6b — retrait de reservations.slot_id
-- ============================================================
--
-- Toutes les pros actives sont sur le moteur de disponibilités : les
-- réservations sont bornées par blocked_start_datetime / blocked_end_datetime
-- (snapshot 3.2), plus par un `slot` précréé. Le code backend ne lit ni
-- n'écrit plus `reservations.slot_id` (annulation, report, no-show, cron
-- paiements, export RGPD nettoyés). La colonne est morte.
--
-- La table `slots` elle-même est conservée pour l'instant (endpoints
-- /api/pro/slots/* encore exposés) — seul le lien depuis reservations part.
--
-- Idempotent (`IF EXISTS`).

BEGIN;

DROP INDEX IF EXISTS idx_reservations_slot;
ALTER TABLE reservations DROP COLUMN IF EXISTS slot_id;

COMMIT;
