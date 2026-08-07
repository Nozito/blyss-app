-- Defense-in-depth for RLS-enabled tables with no policies.
--
-- Context: this app does NOT use Supabase Auth. The Express backend
-- (backend/server.ts) connects with the service_role key, which bypasses
-- RLS entirely — authorization is enforced in application code (JWT
-- middleware + explicit ownership checks like `reservation.client_id !==
-- clientId`), not by Postgres RLS. There is no bridge between this app's
-- own user IDs and Supabase's `auth.uid()`, so per-row policies keyed on
-- `auth.uid()` would be meaningless here (it's always NULL — no Supabase
-- Auth session is ever created) and would misleadingly suggest a real
-- per-user access model that doesn't exist in this architecture.
--
-- RLS being enabled with zero policies already makes every one of these
-- tables return an empty result set for the `anon`/`authenticated` roles
-- (Postgres RLS defaults to deny when no policy matches). This migration
-- makes that intended state explicit and durable by also revoking table
-- privileges directly, so a future `CREATE POLICY ... USING (true)` added
-- for one table can't accidentally reopen every table that shares it.
--
-- If Supabase Auth (or PostgREST/anon-key access from a client) is ever
-- wired up for real, replace this migration's revokes with actual
-- `auth.uid()`-scoped policies at that time — this is a placeholder floor,
-- not a substitute for that work.

-- gallery_images (added in 20260806000001) never had RLS enabled at all.
ALTER TABLE gallery_images ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  users,
  refresh_tokens,
  reservations,
  payments,
  payment_methods,
  subscriptions,
  reviews,
  notifications,
  pro_client_notes,
  favorites,
  gallery_images
FROM anon, authenticated;
