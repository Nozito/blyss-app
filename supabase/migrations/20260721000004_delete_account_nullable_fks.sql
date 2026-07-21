-- DELETE /api/auth/delete-account anonymizes reservations and payments
-- before removing the user row (accounting/legal retention requires those
-- rows to survive). It already relies on reservations.client_id being
-- nullable (relaxed in 20260417000002), but reservations.pro_id and
-- payments.client_id/pro_id were never relaxed — meaning any pro, or any
-- client/pro with payment history, gets a NOT NULL violation and the whole
-- self-service deletion fails with a 500. This is the majority of real
-- users on a booking app: RGPD deletion was effectively broken for them.

ALTER TABLE reservations ALTER COLUMN pro_id DROP NOT NULL;
ALTER TABLE payments ALTER COLUMN client_id DROP NOT NULL;
ALTER TABLE payments ALTER COLUMN pro_id DROP NOT NULL;
