-- "Ignorer" un signalement (20260812000002) marquait juste status='reviewed',
-- ce qui le laissait compter dans reported_count/is_vigilant comme un
-- signalement fondé. Si l'admin estime que la personne visée n'y est pour
-- rien, le signalement doit être exonéré, pas juste archivé.
--
-- outcome distingue les deux issues possibles d'un traitement :
--  - 'dismissed' : classé sans suite (ignore, ou restore qui annule une
--    modération) — n'engage pas la personne visée, exclu du compteur de
--    vigilance
--  - 'upheld'    : signalement fondé (delete du contenu) — compte

ALTER TABLE message_flags
  ADD COLUMN outcome TEXT CHECK (outcome IN ('upheld', 'dismissed'));
