# ⚠️ Dossier archivé — ne pas exécuter

Ces fichiers datent d'avant la bascule vers Postgres/Supabase (certains utilisent
une syntaxe MySQL, ex. `INT UNSIGNED`, incompatible avec la base actuelle).

**Le système de migrations actif est `supabase/migrations/`**, géré via
`node scripts/db.mjs` (`status` / `push` / `new <nom>`).

Ce dossier est conservé uniquement comme historique. N'appliquez aucun de ces
`.sql` contre la base de production.
