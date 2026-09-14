-- Un nouveau compte pro doit être privé par défaut — l'inscription
-- (backend/routes/auth.routes.ts) ne précisait jamais profile_visibility,
-- retombant sur ce défaut de colonne qui était 'public'. Conséquence : tout
-- nouveau pro était visible/réservable par les clientes dès la création,
-- avant même d'avoir rempli son profil. Le code d'inscription fixe
-- maintenant explicitement 'private' — cette migration aligne le défaut de
-- colonne en filet de sécurité (ex. un futur INSERT qui oublierait la
-- colonne). N'affecte que les futures INSERT, ne touche pas les lignes déjà
-- en base.
ALTER TABLE users ALTER COLUMN profile_visibility SET DEFAULT 'private';
