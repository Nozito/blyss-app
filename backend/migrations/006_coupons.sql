-- Migration: Coupons table for admin promo codes
CREATE TABLE IF NOT EXISTS coupons (
  id             SERIAL PRIMARY KEY,
  code           VARCHAR(50) NOT NULL UNIQUE,
  discount_type  VARCHAR(10) NOT NULL DEFAULT 'percent' CHECK (discount_type IN ('percent', 'fixed')),
  discount_value DECIMAL(10,2) NOT NULL,
  applicable_plans JSONB NOT NULL DEFAULT '["start","serenite","signature"]',
  expires_at     TIMESTAMPTZ NULL DEFAULT NULL,
  max_uses       INTEGER NULL DEFAULT NULL,
  used_count     INTEGER NOT NULL DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons (code);
CREATE INDEX IF NOT EXISTS idx_coupons_is_active ON coupons (is_active);
