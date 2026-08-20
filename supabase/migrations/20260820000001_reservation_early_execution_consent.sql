-- Art. L221-18 s. Code de la consommation : pour une prestation de service
-- exécutée avant l'expiration du délai de rétractation de 14 jours, le
-- consommateur doit formuler une demande expresse distincte de toute autre
-- acceptation (ex : politique d'annulation du pro) et être informé qu'il
-- perd son droit de rétractation une fois la prestation pleinement exécutée.
-- Ce timestamp sert de preuve de ce consentement exprès, recueilli au
-- moment de la réservation (voir server.ts POST /api/reservations).
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS early_execution_requested_at TIMESTAMPTZ;
