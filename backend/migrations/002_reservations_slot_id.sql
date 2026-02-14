-- Add slot_id column to reservations table
ALTER TABLE reservations ADD COLUMN slot_id INT UNSIGNED DEFAULT NULL;
ALTER TABLE reservations ADD CONSTRAINT fk_reservations_slot FOREIGN KEY (slot_id) REFERENCES slots(id) ON DELETE SET NULL;
