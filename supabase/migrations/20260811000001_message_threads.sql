-- "Écrire à sa pro" — fil de discussion client↔pro, ouvrable avant toute
-- réservation (comme "Contacter l'hôte" sur Airbnb) et épinglé au dernier
-- rendez-vous une fois qu'il existe. Un seul fil par paire (client_id,
-- pro_id) — pas un fil par réservation — pour que l'historique de la
-- relation reste continu d'un rendez-vous au suivant.
--
-- message_flags suit exactement le modèle de review_flags (20260809000002) :
-- signalement au niveau du fil, pas du message, car la modération porte sur
-- "cette conversation pose problème", pas sur un message isolé — cohérent
-- avec le choix produit de ne jamais lire les fils de façon proactive.

CREATE TABLE message_threads (
  id                    SERIAL PRIMARY KEY,
  client_id             INT REFERENCES users(id),
  pro_id                INT REFERENCES users(id),
  last_reservation_id   INT REFERENCES reservations(id) ON DELETE SET NULL,
  last_message_at       TIMESTAMPTZ,
  last_message_preview  TEXT,
  client_unread_count   INT NOT NULL DEFAULT 0,
  pro_unread_count      INT NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, pro_id)
);

CREATE TRIGGER trg_message_threads_updated_at
  BEFORE UPDATE ON message_threads
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX idx_message_threads_client ON message_threads(client_id, last_message_at DESC);
CREATE INDEX idx_message_threads_pro    ON message_threads(pro_id, last_message_at DESC);

-- sender_id nullable pour survivre à l'anonymisation RGPD (suppression de
-- compte) sans casser le fil pour l'autre participant — même raisonnement
-- que reservations.client_id/pro_id nullable après 20260721000004.
CREATE TABLE messages (
  id                   SERIAL PRIMARY KEY,
  thread_id            INT NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  sender_id            INT REFERENCES users(id),
  body                 TEXT,
  attachment_url       TEXT,
  attachment_thumbnail TEXT,
  read_at              TIMESTAMPTZ,
  deleted_at           TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT messages_has_content CHECK (body IS NOT NULL OR attachment_url IS NOT NULL)
);

CREATE INDEX idx_messages_thread ON messages(thread_id, created_at);

CREATE TABLE message_flags (
  id          SERIAL PRIMARY KEY,
  thread_id   INT NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  flagged_by  INT REFERENCES users(id) ON DELETE CASCADE,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (thread_id, flagged_by)
);

CREATE INDEX idx_message_flags_thread ON message_flags(thread_id);

ALTER TABLE message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_flags   ENABLE ROW LEVEL SECURITY;
