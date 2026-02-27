-- ============================================================
-- Blyss App — PostgreSQL Schema
-- Migrated from MySQL (18 tables)
-- Sprint 1: MySQL → Supabase migration
-- ============================================================

-- ============================================================
-- 0. Helper: updated_at trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 1. users
-- ============================================================
CREATE TABLE users (
  id                          SERIAL PRIMARY KEY,
  first_name                  VARCHAR(255),
  last_name                   VARCHAR(255),
  email                       VARCHAR(255) NOT NULL UNIQUE,
  password_hash               VARCHAR(255) NOT NULL,
  phone_number                VARCHAR(20),
  birth_date                  DATE,
  role                        TEXT NOT NULL DEFAULT 'client'
                                CHECK (role IN ('client', 'pro', 'admin')),
  is_admin                    BOOLEAN NOT NULL DEFAULT FALSE,
  pro_status                  TEXT DEFAULT 'inactive'
                                CHECK (pro_status IN ('active', 'inactive')),
  activity_name               VARCHAR(255),
  city                        VARCHAR(255),
  instagram_account           VARCHAR(255),
  profile_photo               VARCHAR(500),
  banner_photo                VARCHAR(500),
  bio                         TEXT,
  -- IBAN: AES-256-GCM with random IV per record (Sprint 1 — migrated from static IV)
  "IBAN"                      TEXT,
  iban_iv                     VARCHAR(64),    -- 12-byte random IV, hex-encoded
  iban_tag                    VARCHAR(64),    -- 16-byte GCM auth tag, hex-encoded
  iban_last4                  VARCHAR(10),
  bankaccountname             TEXT,
  accept_online_payment       BOOLEAN NOT NULL DEFAULT FALSE,
  bank_info_updated_at        TIMESTAMPTZ,
  monthly_objective           INT DEFAULT 0,
  -- Stripe Connect
  stripe_account_id           VARCHAR(255),
  stripe_customer_id          VARCHAR(255),
  stripe_onboarding_complete  BOOLEAN NOT NULL DEFAULT FALSE,
  deposit_percentage          INT DEFAULT 50,
  -- Profile
  profile_visibility          TEXT DEFAULT 'public'
                                CHECK (profile_visibility IN ('public', 'private')),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_role_status ON users(role, pro_status);
CREATE INDEX idx_users_is_admin ON users(is_admin) WHERE is_admin = TRUE;

-- ============================================================
-- 2. refresh_tokens
-- ============================================================
CREATE TABLE refresh_tokens (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       VARCHAR(512) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token);

-- ============================================================
-- 3. prestations (services offered by pros)
-- ============================================================
CREATE TABLE prestations (
  id                SERIAL PRIMARY KEY,
  pro_id            INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name              VARCHAR(255) NOT NULL,
  description       TEXT,
  price             NUMERIC(10,2) NOT NULL,
  duration_minutes  INT NOT NULL,
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_prestations_pro ON prestations(pro_id, active);

CREATE TRIGGER trg_prestations_updated_at
  BEFORE UPDATE ON prestations
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- 4. slots
-- ============================================================
CREATE TABLE slots (
  id              SERIAL PRIMARY KEY,
  pro_id          INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_datetime  TIMESTAMPTZ NOT NULL,
  end_datetime    TIMESTAMPTZ NOT NULL,
  duration        INT NOT NULL,  -- minutes
  status          TEXT NOT NULL DEFAULT 'available'
                    CHECK (status IN ('available', 'booked', 'blocked')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_slots_pro_status_start ON slots(pro_id, status, start_datetime);
CREATE INDEX idx_slots_start ON slots(start_datetime);

CREATE TRIGGER trg_slots_updated_at
  BEFORE UPDATE ON slots
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- 5. reservations
-- ============================================================
CREATE TABLE reservations (
  id              SERIAL PRIMARY KEY,
  client_id       INT NOT NULL REFERENCES users(id),
  pro_id          INT NOT NULL REFERENCES users(id),
  prestation_id   INT REFERENCES prestations(id),
  slot_id         INT REFERENCES slots(id) ON DELETE SET NULL,
  start_datetime  TIMESTAMPTZ NOT NULL,
  end_datetime    TIMESTAMPTZ NOT NULL,
  status          TEXT NOT NULL DEFAULT 'confirmed'
                    CHECK (status IN ('confirmed', 'pending', 'completed', 'cancelled')),
  price           NUMERIC(10,2) NOT NULL DEFAULT 0,
  paid_online     BOOLEAN NOT NULL DEFAULT FALSE,
  payment_status  TEXT NOT NULL DEFAULT 'unpaid'
                    CHECK (payment_status IN ('unpaid', 'deposit_paid', 'fully_paid', 'paid_on_site')),
  total_paid      NUMERIC(10,2) NOT NULL DEFAULT 0,
  deposit_amount  NUMERIC(10,2),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reservations_client ON reservations(client_id);
CREATE INDEX idx_reservations_pro ON reservations(pro_id);
CREATE INDEX idx_reservations_status_date ON reservations(status, start_datetime);
CREATE INDEX idx_reservations_slot ON reservations(slot_id);

CREATE TRIGGER trg_reservations_updated_at
  BEFORE UPDATE ON reservations
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- 6. reviews
-- ============================================================
CREATE TABLE reviews (
  id          SERIAL PRIMARY KEY,
  client_id   INT NOT NULL REFERENCES users(id),
  pro_id      INT NOT NULL REFERENCES users(id),
  rating      INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, pro_id)
);

CREATE INDEX idx_reviews_pro ON reviews(pro_id);

CREATE TRIGGER trg_reviews_updated_at
  BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- 7. notifications
-- ============================================================
CREATE TABLE notifications (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        VARCHAR(50) NOT NULL,
  title       VARCHAR(255) NOT NULL,
  message     TEXT NOT NULL,
  data        JSONB,
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_read ON notifications(user_id, is_read, created_at DESC);

-- ============================================================
-- 8. notification_preferences (legacy — kept for compatibility)
-- ============================================================
CREATE TABLE notification_preferences (
  id               SERIAL PRIMARY KEY,
  user_id          INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  preference_type  VARCHAR(50) NOT NULL,
  enabled          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, preference_type)
);

-- ============================================================
-- 9. client_notification_settings
-- ============================================================
CREATE TABLE client_notification_settings (
  id             SERIAL PRIMARY KEY,
  user_id        INT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  reminders      BOOLEAN NOT NULL DEFAULT TRUE,
  changes        BOOLEAN NOT NULL DEFAULT TRUE,
  messages       BOOLEAN NOT NULL DEFAULT TRUE,
  late           BOOLEAN NOT NULL DEFAULT TRUE,
  offers         BOOLEAN NOT NULL DEFAULT TRUE,
  email_summary  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_client_notif_settings_updated_at
  BEFORE UPDATE ON client_notification_settings
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- 10. pro_notification_settings
-- ============================================================
CREATE TABLE pro_notification_settings (
  id                SERIAL PRIMARY KEY,
  user_id           INT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  new_reservation   BOOLEAN NOT NULL DEFAULT TRUE,
  cancel_change     BOOLEAN NOT NULL DEFAULT TRUE,
  daily_reminder    BOOLEAN NOT NULL DEFAULT TRUE,
  client_message    BOOLEAN NOT NULL DEFAULT TRUE,
  payment_alert     BOOLEAN NOT NULL DEFAULT TRUE,
  activity_summary  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_pro_notif_settings_updated_at
  BEFORE UPDATE ON pro_notification_settings
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- 11. pro_client_notes
-- ============================================================
CREATE TABLE pro_client_notes (
  id          SERIAL PRIMARY KEY,
  pro_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id   INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pro_id, client_id)
);

CREATE TRIGGER trg_pro_client_notes_updated_at
  BEFORE UPDATE ON pro_client_notes
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- 12. subscription_plans (static reference data)
-- ============================================================
CREATE TABLE subscription_plans (
  id             SERIAL PRIMARY KEY,
  name           VARCHAR(50) NOT NULL UNIQUE,
  description    TEXT,
  monthly_price  NUMERIC(10,2) NOT NULL,
  annual_price   NUMERIC(10,2),
  features       JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 13. subscriptions
-- ============================================================
CREATE TABLE subscriptions (
  id                SERIAL PRIMARY KEY,
  client_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan              TEXT NOT NULL CHECK (plan IN ('start', 'serenite', 'signature')),
  billing_type      TEXT NOT NULL CHECK (billing_type IN ('monthly', 'one_time')),
  monthly_price     NUMERIC(10,2) NOT NULL,
  total_price       NUMERIC(10,2),
  commitment_months INT,
  start_date        DATE NOT NULL,
  end_date          DATE,
  status            TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'cancelled', 'pending')),
  payment_id        VARCHAR(255),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_client ON subscriptions(client_id, status);
CREATE INDEX idx_subscriptions_status_end ON subscriptions(status, end_date);

CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- 14. payments
-- ============================================================
CREATE TABLE payments (
  id                        SERIAL PRIMARY KEY,
  reservation_id            INT NOT NULL REFERENCES reservations(id),
  client_id                 INT NOT NULL REFERENCES users(id),
  pro_id                    INT NOT NULL REFERENCES users(id),
  type                      TEXT NOT NULL
                              CHECK (type IN ('deposit', 'balance', 'full', 'on_site')),
  amount                    NUMERIC(10,2) NOT NULL,
  stripe_payment_intent_id  VARCHAR(255) UNIQUE,
  status                    TEXT NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'refunded')),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_reservation ON payments(reservation_id);
CREATE INDEX idx_payments_client ON payments(client_id);
CREATE INDEX idx_payments_pro ON payments(pro_id);

CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- 15. payment_methods
-- NOTE: card_number + cvc intentionally omitted (was plaintext in MySQL v1)
--       Use stripe_pm_id (Stripe PaymentMethod ID) instead
-- ============================================================
CREATE TABLE payment_methods (
  id               SERIAL PRIMARY KEY,
  user_id          INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  brand            TEXT CHECK (brand IN ('visa', 'mastercard', 'amex')),
  last4            VARCHAR(4),
  exp_month        INT,
  exp_year         INT,
  cardholder_name  VARCHAR(255),
  stripe_pm_id     VARCHAR(255),  -- Stripe PaymentMethod ID (replaces plaintext card)
  is_default       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payment_methods_user ON payment_methods(user_id, is_default);

-- ============================================================
-- 16. revenucat_webhooks
-- ============================================================
CREATE TABLE revenucat_webhooks (
  id          SERIAL PRIMARY KEY,
  event_id    VARCHAR(255) NOT NULL UNIQUE,
  event_type  VARCHAR(100) NOT NULL,
  payload     JSONB NOT NULL,
  processed   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_revenucat_processed ON revenucat_webhooks(processed, created_at);

-- ============================================================
-- 17. favorites
-- ============================================================
CREATE TABLE favorites (
  id          SERIAL PRIMARY KEY,
  client_id   INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pro_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, pro_id)
);

CREATE INDEX idx_favorites_pro ON favorites(pro_id);

-- ============================================================
-- 18a. instagram_connections
-- ============================================================
CREATE TABLE instagram_connections (
  id                  SERIAL PRIMARY KEY,
  pro_id              INT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  instagram_user_id   VARCHAR(50) NOT NULL,
  instagram_username  VARCHAR(100) NOT NULL,
  -- Token encrypted AES-256-GCM (never stored in plaintext)
  access_token_enc    TEXT NOT NULL,
  token_iv            VARCHAR(64) NOT NULL,
  token_tag           VARCHAR(64) NOT NULL,
  token_expires_at    TIMESTAMPTZ NOT NULL,
  last_refreshed_at   TIMESTAMPTZ NOT NULL,
  scopes_granted      VARCHAR(255) NOT NULL DEFAULT 'user_profile,user_media',
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  disconnect_reason   VARCHAR(100),  -- revoked | expired | manual | plan_downgrade
  connected_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ig_conn_expires ON instagram_connections(token_expires_at);
CREATE INDEX idx_ig_conn_active ON instagram_connections(is_active);

CREATE TRIGGER trg_ig_connections_updated_at
  BEFORE UPDATE ON instagram_connections
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- 18b. instagram_media_cache
-- ============================================================
CREATE TABLE instagram_media_cache (
  id               SERIAL PRIMARY KEY,
  pro_id           INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_id         VARCHAR(50) NOT NULL,
  media_type       TEXT NOT NULL CHECK (media_type IN ('IMAGE', 'VIDEO', 'CAROUSEL_ALBUM')),
  media_url        TEXT NOT NULL,
  thumbnail_url    TEXT,
  permalink        VARCHAR(512) NOT NULL,
  caption          TEXT,
  ig_timestamp     TIMESTAMPTZ NOT NULL,
  cached_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cache_expires_at TIMESTAMPTZ NOT NULL,  -- cached_at + 1h (CDN URL validity)
  display_order    SMALLINT NOT NULL DEFAULT 1,  -- 1 = most recent
  UNIQUE (pro_id, media_id)
);

CREATE INDEX idx_ig_cache_order ON instagram_media_cache(pro_id, display_order);
CREATE INDEX idx_ig_cache_expires ON instagram_media_cache(cache_expires_at);

-- ============================================================
-- 18c. instagram_sync_log
-- ============================================================
CREATE TABLE instagram_sync_log (
  id            SERIAL PRIMARY KEY,
  pro_id        INT NOT NULL,
  sync_type     TEXT NOT NULL CHECK (sync_type IN ('auto', 'manual', 'oauth_connect')),
  status        TEXT NOT NULL CHECK (status IN ('success', 'failed', 'rate_limited', 'token_expired', 'skip')),
  photos_count  SMALLINT,
  api_calls     SMALLINT NOT NULL DEFAULT 0,
  error_msg     VARCHAR(500),
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ig_log_pro ON instagram_sync_log(pro_id);
CREATE INDEX idx_ig_log_date ON instagram_sync_log(synced_at DESC);

-- ============================================================
-- RLS — Row Level Security
-- Express backend uses service_role key (bypasses RLS by default)
-- RLS is defense-in-depth for future direct Supabase client usage
-- ============================================================
ALTER TABLE users                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens              ENABLE ROW LEVEL SECURITY;
ALTER TABLE prestations                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE slots                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations                ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications               ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences    ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE pro_notification_settings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pro_client_notes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions               ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods             ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_connections       ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_media_cache       ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_sync_log          ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Seed: subscription_plans reference data
-- ============================================================
INSERT INTO subscription_plans (name, monthly_price, annual_price, description, features) VALUES
  ('start',     29.00, NULL, 'Plan de démarrage — accès aux fonctionnalités essentielles',
    '["Réservations illimitées", "Profil public", "Calendrier", "Notifications"]'::jsonb),
  ('serenite',  59.00, NULL, 'Plan sérénité — fonctionnalités avancées',
    '["Tout Start", "Paiements en ligne", "Instagram", "Statistiques"]'::jsonb),
  ('signature', 99.00, NULL, 'Plan signature — accès complet premium',
    '["Tout Sérénité", "Support prioritaire", "Objectifs financiers", "Export comptable"]'::jsonb);
