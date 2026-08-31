-- Workflow de consentement client pour le report d'un RDV proposé par la pro.
--
-- PATCH /api/pro/appointments/:id ne modifie plus directement `reservations` :
-- il crée une proposition ici, que la cliente doit explicitement accepter
-- (PATCH /api/client/reschedule-requests/:id/accept) avant que le RDV bouge.
-- `reservations` reste inchangée tant qu'aucune proposition n'est acceptée.
--
-- Non destructif : aucune colonne ni table existante n'est modifiée.

CREATE TABLE reschedule_requests (
  id                        SERIAL PRIMARY KEY,
  reservation_id            INT NOT NULL REFERENCES reservations(id),
  initiated_by              TEXT NOT NULL CHECK (initiated_by IN ('pro', 'client')),
  reason                    TEXT,
  proposed_start_datetime   TIMESTAMPTZ NOT NULL,
  proposed_end_datetime     TIMESTAMPTZ NOT NULL,
  proposed_prestation_id    INT REFERENCES prestations(id),
  proposed_price            NUMERIC(10,2),
  status                    TEXT NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
  expires_at                TIMESTAMPTZ NOT NULL,
  accepted_at               TIMESTAMPTZ,
  -- 'phone' = la pro a annoncé le report par téléphone ; elle doit quand même
  -- passer par ce workflow (motif obligatoire, cf. contrainte ci-dessous) et
  -- la cliente doit quand même accepter explicitement dans l'app — cela
  -- évite qu'un appel téléphonique serve de prétexte pour contourner le
  -- consentement.
  initiated_via             TEXT NOT NULL DEFAULT 'app' CHECK (initiated_via IN ('app', 'phone')),
  created_by_user_id        INT NOT NULL REFERENCES users(id),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Motif obligatoire pour un report annoncé par téléphone (traçabilité RGPD :
-- on sait pourquoi et comment le changement a été proposé).
ALTER TABLE reschedule_requests ADD CONSTRAINT reschedule_requests_phone_requires_reason
  CHECK (initiated_via <> 'phone' OR reason IS NOT NULL);

CREATE INDEX idx_reschedule_requests_reservation ON reschedule_requests(reservation_id);

-- Une seule proposition active à la fois par réservation : empêche la pro
-- d'empiler plusieurs propositions concurrentes sur le même RDV.
CREATE UNIQUE INDEX idx_reschedule_requests_one_pending
  ON reschedule_requests(reservation_id) WHERE status = 'pending';

CREATE TRIGGER trg_reschedule_requests_updated_at BEFORE UPDATE ON reschedule_requests
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Autorisation 100% applicative dans ce backend (clé service_role, RLS non
-- utilisée comme contrôle d'accès réel) — cf. 20260807000002. On réplique
-- ici le même filet deny-all de profondeur.
ALTER TABLE reschedule_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON reschedule_requests FROM anon, authenticated;
