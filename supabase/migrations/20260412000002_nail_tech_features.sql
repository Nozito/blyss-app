-- ============================================================
-- Migration : nail-tech business logic features
-- ============================================================

-- 1. Prestations: instructions de préparation, délai de rappel, tampon
ALTER TABLE prestations
  ADD COLUMN IF NOT EXISTS preparation_instructions TEXT,
  ADD COLUMN IF NOT EXISTS recall_weeks INT
    CHECK (recall_weeks IS NULL OR (recall_weeks BETWEEN 1 AND 52)),
  ADD COLUMN IF NOT EXISTS buffer_after_minutes INT NOT NULL DEFAULT 0
    CHECK (buffer_after_minutes IN (0, 5, 10, 15, 20, 30));

-- 2. Reservations: no-show + recall envoyé
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS is_no_show   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS recall_sent  BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_reservations_recall
  ON reservations(recall_sent, status, start_datetime)
  WHERE recall_sent = FALSE AND status = 'completed';

-- 3. Pro client notes: fiche enrichie pour prothésiste
ALTER TABLE pro_client_notes
  ADD COLUMN IF NOT EXISTS allergies        TEXT,
  ADD COLUMN IF NOT EXISTS preferred_shape  TEXT
    CHECK (preferred_shape IN ('round','square','oval','almond','coffin','stiletto','squoval')),
  ADD COLUMN IF NOT EXISTS preferred_style  TEXT,
  ADD COLUMN IF NOT EXISTS patch_test_done  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS patch_test_date  DATE;

-- 4. Clients blacklistés par le pro
CREATE TABLE IF NOT EXISTS blocked_clients (
  id          SERIAL PRIMARY KEY,
  pro_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id   INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pro_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_blocked_clients_pro ON blocked_clients(pro_id);

-- 5. Liste d'attente: clientes qui souhaitent être rappelées si un créneau se libère
CREATE TABLE IF NOT EXISTS waiting_list (
  id              SERIAL PRIMARY KEY,
  pro_id          INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id       INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prestation_id   INT REFERENCES prestations(id) ON DELETE SET NULL,
  preferred_date  DATE,
  note            TEXT,
  notified_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pro_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_waiting_list_pro ON waiting_list(pro_id, notified_at);
