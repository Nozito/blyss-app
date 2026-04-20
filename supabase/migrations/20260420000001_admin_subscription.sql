-- Give admin@blyss.dev an active Signature subscription (best plan)
INSERT INTO subscriptions (client_id, plan, billing_type, monthly_price, total_price, commitment_months, start_date, end_date, status, payment_id)
SELECT
  u.id,
  'signature',
  'one_time',
  29.90,
  358.80,
  12,
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '1 year',
  'active',
  'admin_internal'
FROM users u
WHERE u.email = 'admin@blyss.dev'
  AND NOT EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.client_id = u.id AND s.status = 'active'
  );
