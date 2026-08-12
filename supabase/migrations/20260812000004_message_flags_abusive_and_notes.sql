-- Ajoute une troisième issue possible à un signalement : 'abusive' — le
-- signalement lui-même était de mauvaise foi (mensonger, pression sur
-- l'autre partie). Contrairement à 'dismissed' (infondé mais de bonne foi),
-- ça engage le REPORTER (flagged_by), pas la personne visée — voir
-- backend/routes/admin.routes.ts pour le calcul de reports_made côté admin.
--
-- admin_note : note interne libre laissée par l'admin qui traite le
-- signalement (jamais montrée à l'utilisateur — voir décision produit du
-- 2026-08-12, warning = note interne uniquement).

ALTER TABLE message_flags DROP CONSTRAINT message_flags_outcome_check;
ALTER TABLE message_flags ADD CONSTRAINT message_flags_outcome_check
  CHECK (outcome IN ('upheld', 'dismissed', 'abusive'));

ALTER TABLE message_flags ADD COLUMN admin_note TEXT;
