# Runbook — bascule des 16 pros vers le moteur de disponibilité (chantier 4.6b)

Script : `backend/migrate-16-pros.ts` · Tests : `backend/__tests__/migrate-16-pros.test.ts`
Issue : blyss-app #26

---

## 1. Contexte

- 16 pros `role='pro' AND pro_status='active'`, toutes `uses_availability_engine = FALSE`.
- **Aucune n'a de `working_hours`.** Le script seed donc des horaires par défaut
  (**lundi→samedi 09:00–19:00, dimanche fermé**) puis bascule le flag, en une
  transaction par pro.
- Chaque pro ajuste ensuite ses horaires depuis l'app mobile — les valeurs
  seedées ne sont qu'un point de départ cohérent.
- Cas particulier : **Sophie Nails (#75)** a 57 slots `available` futurs +
  ~78 réservations futures. Les réservations ne sont pas touchées ; les 57 slots
  ouverts sont supprimés (après snapshot) avec `--clear-open-slots` pour éviter
  une double source de vérité.

## 2. Pré-requis

- [ ] Accès DB prod (`.env.prod` / pooler Supabase).
- [ ] Build iOS #20 **approuvé par Apple** et parcours pro « moteur » vérifié sur
      un build réel (le flag change le calcul de dispo pour de vrais clients →
      ne pas exécuter pendant la fenêtre de revue App Store).
- [ ] `git pull` sur `main` (script + tests présents).
- [ ] Fenêtre calme (peu de réservations en cours) — la bascule est quasi
      instantanée mais on veut pouvoir vérifier à froid.
- [ ] Dossier `backend/migration-snapshots/` archivable après coup.

## 3. Exécution

Depuis la racine `blyss-app`, avec l'environnement prod chargé :

```bash
export MIGRATE_ENV_FILE=.env.prod   # sinon .env.dev par défaut

# 3.1 — DRY-RUN (obligatoire, n'écrit rien)
node_modules/.bin/ts-node backend/migrate-16-pros.ts --dry-run --clear-open-slots

# Attendu : 16 pros listées, 15 "SEED 6 plages", #75 "SEED 6 plages" + "57 supprimés",
#           "16 pro(s) seraient basculée(s). Aucune écriture."

# 3.2 — Bascule d'un seul pro témoin d'abord (recommandé)
node_modules/.bin/ts-node backend/migrate-16-pros.ts --pro 2

# Vérifier (cf. §4) que #2 est TRUE, a 6 working_hours, getAvailability OK.

# 3.3 — Le reste
node_modules/.bin/ts-node backend/migrate-16-pros.ts --clear-open-slots
```

Le script logue par pro `✅` / `❌` et un résumé
`N/16 pro(s) basculée(s) — X seedée(s), … Y échec(s)`. Code de sortie `0` si
`failed = 0`, sinon `1`.

## 4. Vérifications post-migration

```sql
-- (a) 16 pros sur le moteur, 0 restante en legacy
SELECT count(*) FROM users
 WHERE role='pro' AND pro_status='active' AND uses_availability_engine = TRUE;   -- attendu 16

SELECT id, email FROM users
 WHERE role='pro' AND pro_status='active' AND uses_availability_engine = FALSE;  -- attendu 0 ligne

-- (b) chaque pro a bien 6 plages (ou ses plages préexistantes)
SELECT pro_id, count(*) FROM working_hours GROUP BY pro_id ORDER BY pro_id;

-- (c) plus aucun slot available futur (si --clear-open-slots)
SELECT pro_id, count(*) FROM slots
 WHERE status='available' AND end_datetime > NOW() GROUP BY pro_id;              -- attendu 0 ligne

-- (d) aucune réservation future orpheline créée par la migration
SELECT count(*) FROM reservations
 WHERE status IN ('confirmed','pending') AND start_datetime > NOW();             -- inchangé (~78)
```

- [ ] Vérif manuelle **3 pros** (dont #75) : `GET /api/pros/:id/availability`
      renvoie des créneaux calculés 09:00–19:00 lun→sam.
- [ ] Vérif manuelle #75 : ses réservations futures existent toujours, son
      calendrier pro s'affiche.
- [ ] `availability_engine_disabled_at` reste `NULL` pour les 16 (aucun revert).

## 5. Seuil d'échec & rollback

**Seuil :** si **> 2 pros** en `failed`, ou si une vérif §4 échoue → rollback
global. Sinon, traiter les `failed` au cas par cas (relancer `--pro <id>`, la
relance est idempotente).

### Rollback d'une pro (depuis son snapshot `migration-snapshots/<stamp>-pro-<id>.json`)

```sql
BEGIN;
-- 1. repasser en legacy
UPDATE users SET uses_availability_engine = FALSE WHERE id = <id>;
-- 2. retirer les horaires seedés (si le snapshot montre working_hours_before = [])
DELETE FROM working_hours WHERE pro_id = <id>;
--    … ou réinsérer working_hours_before si la pro en avait déjà.
-- 3. restaurer les slots supprimés (uniquement ceux status='available' du snapshot,
--    à réinsérer depuis le JSON — id, start_datetime, end_datetime, duration, status)
COMMIT;
```

> Les slots `booked` / `blocked` ne sont jamais touchés par le script — rien à
> restaurer pour eux. Le trigger `users_availability_engine_disable` renseigne
> `availability_engine_disabled_at` lors du repli, sans effet fonctionnel.

### Rollback global

Boucler le bloc ci-dessus sur les pros migrées listées dans le log, ou :

```sql
UPDATE users SET uses_availability_engine = FALSE
 WHERE role='pro' AND pro_status='active';
DELETE FROM working_hours
 WHERE pro_id IN (SELECT id FROM users WHERE role='pro' AND pro_status='active');
```

puis réinsérer les slots `available` depuis les snapshots. Aucune réservation
n'est à restaurer (le script n'en supprime aucune).

## 6. Après succès

1. Archiver `backend/migration-snapshots/` (git-ignored) hors du repo.
2. Étape 4 (#26) : retirer le skip `20260904000002` dans `.github/workflows/ci.yml`,
   vérifier CI verte, appliquer la migration `drop reservations.slot_id` en prod,
   mettre à jour `docs/DESIGN_4_deprecation-slots-precrees.md`, commenter puis
   clore #26.
