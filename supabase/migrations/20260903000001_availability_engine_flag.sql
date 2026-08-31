-- ============================================================
-- Chantier 4 — bascule progressive vers le moteur de disponibilités
-- ============================================================
--
-- Flag PAR PRO : tant que `uses_availability_engine` est FALSE (défaut), la pro
-- reste sur le modèle `slots` précréés — `getAvailability` lit alors les slots
-- via un adaptateur (cf. availability.service.ts) au lieu de calculer depuis
-- `working_hours`. Aucune pro n'est basculée par cette migration.
--
-- Kill-switch global : env AVAILABILITY_ENGINE_FORCE_OFF=true fait répondre le
-- moteur comme "non migré" pour TOUTES les pros, sans toucher au flag.
--
-- Non destructif.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS uses_availability_engine BOOLEAN NOT NULL DEFAULT FALSE,
  -- Trace la date à laquelle le moteur a été RETIRÉ à cette pro (rollback
  -- manuel d'un pilote, ou kill-switch appliqué durablement) — debug/audit.
  ADD COLUMN IF NOT EXISTS availability_engine_disabled_at TIMESTAMPTZ;

-- Renseigne automatiquement availability_engine_disabled_at à chaque
-- transition TRUE -> FALSE du flag (peu importe le chemin : PUT /api/users,
-- action admin, script de rollback).
CREATE OR REPLACE FUNCTION trg_track_availability_engine_disable()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.uses_availability_engine = TRUE AND NEW.uses_availability_engine = FALSE THEN
    NEW.availability_engine_disabled_at = NOW();
  ELSIF NEW.uses_availability_engine = TRUE THEN
    -- ré-activation : on efface la trace précédente
    NEW.availability_engine_disabled_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_availability_engine_disable ON users;
CREATE TRIGGER users_availability_engine_disable
  BEFORE UPDATE ON users
  FOR EACH ROW
  WHEN (OLD.uses_availability_engine IS DISTINCT FROM NEW.uses_availability_engine)
  EXECUTE FUNCTION trg_track_availability_engine_disable();

COMMIT;
