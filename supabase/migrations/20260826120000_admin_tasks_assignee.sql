-- ============================================================
-- Migration : assignation des tâches admin à un autre admin
-- ============================================================
-- admin_id reste le CRÉATEUR (garde le droit d'éditer/supprimer).
-- assigned_to est la personne responsable de l'exécuter (peut faire
-- avancer le statut). Par défaut = admin_id (auto-assignée), pour
-- préserver le comportement des tâches existantes.

ALTER TABLE admin_tasks
  ADD COLUMN IF NOT EXISTS assigned_to INT REFERENCES users(id) ON DELETE SET NULL;

UPDATE admin_tasks SET assigned_to = admin_id WHERE assigned_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_admin_tasks_assigned_to ON admin_tasks(assigned_to);
