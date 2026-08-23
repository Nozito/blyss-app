-- Distingue les RDV créés par la cliente elle-même (flow de réservation
-- classique) de ceux créés manuellement par la pro pour l'une de ses
-- clientes (walk-in, téléphone) — voir server.ts POST /api/pro/appointments.
-- Sert à l'affichage mobile (badge "ajouté manuellement") et à l'audit.
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS booking_source TEXT NOT NULL DEFAULT 'client'
  CHECK (booking_source IN ('client', 'pro'));
