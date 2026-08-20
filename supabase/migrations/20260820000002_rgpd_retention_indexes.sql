-- Messages, avis et journal d'audit n'avaient jusqu'ici aucune limite de
-- conservation dans le temps (contrairement aux réservations et comptes,
-- déjà couverts par cron/data-retention.ts). Ce fichier ajoute les index
-- nécessaires aux nouvelles requêtes de purge par date — la logique de
-- rétention elle-même vit dans le cron.
--
-- audit_log n'existait en réalité que dans backend/migrations/ (dossier
-- legacy explicitement marqué "ne pas exécuter", jamais porté ici) — chaque
-- appel à logAudit() échouait donc silencieusement depuis le début (try/catch
-- prévu à cet effet dans cron/data-retention.ts). On la crée enfin pour de
-- vrai, avec la même définition que ce fichier legacy.
CREATE TABLE IF NOT EXISTS audit_log (
  id            BIGSERIAL PRIMARY KEY,
  operation     TEXT NOT NULL,
  rows_affected INTEGER NOT NULL DEFAULT 0,
  executed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_created_at    ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at      ON reviews(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_executed_at   ON audit_log(executed_at);
