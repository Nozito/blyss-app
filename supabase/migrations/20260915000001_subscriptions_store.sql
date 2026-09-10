-- ============================================================
-- subscriptions.store — plateforme de facturation de l'abonnement
-- ============================================================
--
-- Permet de connaître la répartition App Store (iOS) / Play Store (Android) /
-- Stripe / offert des abonnés. Renseigné par le webhook RevenueCat depuis
-- `event.store`. NULL pour les lignes antérieures et les grants admin.
--
-- Valeurs : 'app_store' | 'play_store' | 'stripe' | 'promotional' | 'amazon'
--           | 'mac_app_store' | NULL (inconnu / legacy)

BEGIN;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS store TEXT;

ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_store_check;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_store_check
  CHECK (store IS NULL OR store IN (
    'app_store', 'mac_app_store', 'play_store', 'amazon', 'stripe', 'promotional'
  ));

-- Rétroactif : les abos issus d'un achat RevenueCat (payment_id 'rc_%') sur la
-- période actuelle sont tous iOS (l'app Android n'est pas encore distribuée).
-- On ne devine rien au-delà de ça.
UPDATE subscriptions
SET store = 'app_store'
WHERE store IS NULL AND payment_id LIKE 'rc_%';

UPDATE subscriptions
SET store = 'promotional'
WHERE store IS NULL AND payment_id IN ('admin_grant', 'admin_internal');

COMMIT;
