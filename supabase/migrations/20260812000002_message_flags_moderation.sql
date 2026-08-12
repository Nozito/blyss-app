-- Durcit le signalement de conversation ("Écrire à sa pro") :
--  - motif obligatoire (reason_code parmi une liste fermée + texte libre optionnel)
--  - un signalement en attente par (thread, utilisateur) — un second appel est
--    refusé côté API plutôt que d'écraser silencieusement le premier
--  - reported_user_id capture explicitement qui est visé (l'autre participant
--    du fil), pour compter les signalements par personne sans avoir à
--    recalculer via message_threads à chaque requête admin
--  - status suit le traitement admin (pending → reviewed), conservé comme
--    historique au lieu d'être supprimé (voir ignore qui faisait un DELETE)
--  - is_locked sur le fil : dès qu'un signalement est déposé, plus personne
--    ne peut écrire tant qu'un admin n'a pas traité (ignore/delete/restore)

ALTER TABLE message_flags
  ADD COLUMN reason_code TEXT NOT NULL DEFAULT 'autre',
  ADD COLUMN reported_user_id INT REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed')),
  ADD COLUMN handled_at TIMESTAMPTZ,
  ADD COLUMN handled_by INT REFERENCES users(id);

ALTER TABLE message_flags
  ADD CONSTRAINT message_flags_reason_code_check
  CHECK (reason_code IN ('injures_menaces', 'arnaque_paiement', 'contournement_plateforme', 'contenu_inapproprie', 'autre'));

ALTER TABLE message_flags ALTER COLUMN reason_code DROP DEFAULT;

CREATE INDEX idx_message_flags_reported_user ON message_flags(reported_user_id, status);
CREATE INDEX idx_message_flags_status ON message_flags(thread_id, status);

ALTER TABLE message_threads
  ADD COLUMN is_locked BOOLEAN NOT NULL DEFAULT FALSE;
