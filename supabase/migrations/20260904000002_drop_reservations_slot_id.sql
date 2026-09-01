-- ============================================================
-- Chantier 4.6b — retrait de reservations.slot_id
-- ============================================================
--
-- Une fois toutes les pros actives migrées vers le moteur de disponibilités,
-- le modèle `slots` précréés n'est plus lu : les réservations sont bornées par
-- blocked_start_datetime / blocked_end_datetime (snapshot 3.2) et non plus par
-- un slot. La colonne slot_id devient morte.
--
-- ⚠️ CETTE MIGRATION EST AUTO-GARDÉE : elle échoue (et annule la transaction)
--    tant que les prérequis ne sont pas réunis. Elle peut donc rester dans le
--    dossier migrations sans risque de drop prématuré au prochain `db.mjs push`.
--
-- Prérequis (cf. backend/audit-slots-and-overlaps.ts) :
--   1. Aucune pro active encore en mode legacy (uses_availability_engine = FALSE)
--   2. Aucune réservation non annulée ne référence encore un slot (slot_id)
--   3. Les slots legacy des pros migrées ont été purgés
--      (backend/cleanup-legacy-slots.ts --execute)

BEGIN;

DO $$
DECLARE
  legacy_pros   int;
  linked_resas  int;
BEGIN
  SELECT COUNT(*) INTO legacy_pros
  FROM users
  WHERE role = 'pro' AND pro_status = 'active' AND uses_availability_engine = FALSE;

  IF legacy_pros > 0 THEN
    RAISE EXCEPTION
      'Migration bloquée : % pro(s) active(s) encore en mode legacy. '
      'Terminer la bascule (backend/migrate-pros-to-availability-engine.ts) avant de retirer slot_id.',
      legacy_pros;
  END IF;

  SELECT COUNT(*) INTO linked_resas
  FROM reservations
  WHERE slot_id IS NOT NULL AND status <> 'cancelled';

  IF linked_resas > 0 THEN
    RAISE EXCEPTION
      'Migration bloquée : % réservation(s) non annulée(s) référencent encore un slot. '
      'Investiguer / délier ces réservations avant de retirer slot_id.',
      linked_resas;
  END IF;
END $$;

-- Prérequis OK — retrait de la colonne et de son index.
DROP INDEX IF EXISTS idx_reservations_slot;
ALTER TABLE reservations DROP COLUMN IF EXISTS slot_id;

COMMIT;
