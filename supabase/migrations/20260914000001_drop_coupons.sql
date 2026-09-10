-- ============================================================
-- Retrait du système de "coupons" admin
-- ============================================================
--
-- La table `coupons` + l'écran admin existaient mais AUCUN code ne
-- consommait un coupon (ni au paiement backend, ni à l'achat mobile).
-- Les vraies remises sur abonnement App Store passent par les Offer Codes /
-- Promotional Offers d'App Store Connect, ou par "Offrir un abonnement"
-- (admin_grant). Le geste commercial reste possible via ces mécanismes.
--
-- Idempotent (`IF EXISTS`). 0 ligne en prod.

BEGIN;

DROP TABLE IF EXISTS coupons CASCADE;

COMMIT;
