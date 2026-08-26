-- review_flags (20260809000002) a été créée sans RLS, contrairement à toutes
-- les autres tables sensibles du schéma (reviews elle-même l'a depuis
-- 20260227000001, message_flags l'a depuis 20260811000001). Le backend
-- accède toujours via service_role (qui bypass RLS de toute façon — voir
-- 20260807000002 pour le contexte), donc ce n'est pas une brèche exploitable
-- aujourd'hui, mais ça referme l'incohérence pour toute connexion future
-- via anon/authenticated (RLS activée + zéro policy = deny par défaut).
ALTER TABLE review_flags ENABLE ROW LEVEL SECURITY;
