-- ============================================================
-- Migration : RLS policies for blocked_clients + waiting_list
-- ============================================================

-- blocked_clients: only accessible via backend (Express + pg service role)
-- RLS is enabled; no policy = deny all direct PostgREST access
ALTER TABLE blocked_clients ENABLE ROW LEVEL SECURITY;

-- waiting_list: same — backend-only via service role
ALTER TABLE waiting_list ENABLE ROW LEVEL SECURITY;
