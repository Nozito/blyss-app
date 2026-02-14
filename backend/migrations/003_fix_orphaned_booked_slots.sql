-- Migration 003: Fix orphaned booked slots
-- Les réservations créées avant l'ajout de slot_id ont slot_id = NULL.
-- Quand elles ont été annulées, le slot n'a pas pu être libéré.
-- Cette migration remet en 'available' tous les slots 'booked' sans réservation active liée.

UPDATE slots s
SET s.status = 'available'
WHERE s.status = 'booked'
  AND s.id NOT IN (
    SELECT slot_id FROM reservations
    WHERE slot_id IS NOT NULL
      AND status IN ('confirmed', 'pending')
  );
