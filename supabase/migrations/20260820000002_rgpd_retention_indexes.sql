-- Messages, avis et journal d'audit n'avaient jusqu'ici aucune limite de
-- conservation dans le temps (contrairement aux réservations et comptes,
-- déjà couverts par cron/data-retention.ts). Ce fichier ajoute uniquement
-- les index nécessaires aux nouvelles requêtes de purge par date — la
-- logique de rétention elle-même vit dans le cron.
CREATE INDEX IF NOT EXISTS idx_messages_created_at    ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at      ON reviews(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_executed_at   ON audit_log(executed_at);
