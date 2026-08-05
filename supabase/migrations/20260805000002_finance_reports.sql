-- Rapports financiers automatiques (hebdo/mensuel), générés par
-- cron/finance-reports.ts et consultés depuis l'app (Finances > Rapports).
-- Pas de restriction par abonnement ici : la logique de gating par plan est
-- gérée ailleurs (à la discrétion du produit), cette table ne fait que
-- stocker les rapports générés pour tout pro actif.

CREATE TABLE finance_reports (
  id                SERIAL PRIMARY KEY,
  pro_id            INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_type       VARCHAR(10) NOT NULL CHECK (period_type IN ('week', 'month')),
  period_start      DATE NOT NULL,
  period_end        DATE NOT NULL,
  revenue           NUMERIC(10,2) NOT NULL DEFAULT 0,
  previous_revenue  NUMERIC(10,2) NOT NULL DEFAULT 0,
  bookings_count    INT NOT NULL DEFAULT 0,
  avg_basket        NUMERIC(10,2) NOT NULL DEFAULT 0,
  top_services      JSONB NOT NULL DEFAULT '[]',
  viewed_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Un seul rapport par pro/période/type — le cron s'appuie dessus (ON
-- CONFLICT DO NOTHING) pour être idempotent en cas de double exécution.
CREATE UNIQUE INDEX idx_finance_reports_unique_period
  ON finance_reports(pro_id, period_type, period_start);

CREATE INDEX idx_finance_reports_pro_created
  ON finance_reports(pro_id, created_at DESC);
