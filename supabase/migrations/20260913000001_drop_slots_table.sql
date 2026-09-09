-- ============================================================
-- Chantier 4.6c / #31 — suppression du modèle `slots` précréés
-- ============================================================
--
-- Les 16 pros actives sont sur le moteur de disponibilités depuis le
-- 2026-09-04 : la dispo est calculée depuis `working_hours`
-- (blocked_start_datetime / blocked_end_datetime bornent les réservations).
--
-- `reservations.slot_id` a été retiré (20260904000002). Le code backend
-- n'expose plus /api/slots/* ni /api/pro/slots/*, ne lit plus la table
-- (adaptateur legacy `getAvailabilityFromSlots` supprimé, stats "taux de
-- remplissage" retirées). La table est morte.
--
-- Idempotent (`IF EXISTS`). CASCADE retire index, trigger et policies RLS.

BEGIN;

DROP TABLE IF EXISTS slots CASCADE;

COMMIT;
