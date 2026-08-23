# Rapport de stress test — Blyss backend, phase 2

Suite directe du rapport du 2026-08-20 (`rapport-stress-test-2026-08-20.md`). Objectif : lever les bottlenecks alors identifiés (réservation lente, plafond CPU login) et pousser la charge jusqu'au maximum autorisé sur l'infra partagée actuelle (500 VUs), sans jamais dégrader la sécurité ni risquer la prod.

## 1. Résumé exécutif

```
OBJECTIF CIBLE      : 3 000 utilisateurs simultanés (staging isolé requis, non disponible)
PALIER MAX ATTEINT  : 500 VUs, sur infra partagée (dev/prod), en toute sécurité
ITÉRATIONS          : 7 → 12 (suite de la phase 1)
RÉSULTAT            : ⚠️ Objectif business non testable directement (pas de staging) —
                       mais TOUS les bottlenecks de code identifiés sont corrigés et
                       prouvés jusqu'à 500 VUs : 0,00% d'erreurs, aucune double-
                       réservation, aucune fuite mémoire, aucune saturation de pool.
```

| Métrique (à 500 VUs, le palier max testé) | Objectif | Résultat | Statut |
|---|---|---|---|
| Erreurs HTTP | < 1% | **0,00%** | ✅ |
| p95 lecture | < 500ms | **134ms** | ✅ |
| p95 réservation (seuil métier) | < 2s | **908ms** | ✅ |
| Double-réservation | 0 | **0** (preuve N=50, concurrence réelle) | ✅ |
| p95 global | < 500ms | 19,76s | ❌ (plafond CPU bcrypt — attendu, voir §4) |
| CPU | < 80% durable | ~87-94% (700-750% / 8 cœurs) durant les pics de connexion | ❌ (attendu, mono-process) |
| RAM | < 85%, pas de fuite | Stable ~688 Mo tout au long | ✅ |
| Pool DB | pas de saturation durable | ✅ (0 timeout après correction) | ✅ |
| Nettoyage données | confirmé | ✅ à chaque itération | ✅ |

## 2. Bottlenecks corrigés cette phase

### 2.1 Réservation — 6 round-trips SQL → 4, contention artificielle levée

**Cause racine prouvée** (`EXPLAIN (ANALYZE, BUFFERS)` sur données réelles) :

| Requête | Exécution SQL réelle | Round-trip réseau mesuré |
|---|---|---|
| Slot check | 0,094 ms | 52 ms |
| Overlap check | 0,043 ms | 60 ms |
| Baseline (`SELECT 1`) | — | 136 ms |

Le SQL est trivial (indexes parfaits). Le coût vient à 95%+ du nombre d'allers-retours réseau × latence machine-locale→Supabase (RTT non représentatif d'un vrai déploiement co-localisé).

**Second facteur, découvert en analysant mon propre script de test** : un seul pro loadtest concentrait 100% du trafic réservation, saturant artificiellement `pg_advisory_xact_lock(pro_id)` — aucun trafic réel ne ferait ça (des milliers de pros indépendants).

**Corrections appliquées** (`backend/server.ts`) :
- Fusion slot-check + overlap-check + pro-lookup en une seule requête CTE (3 round-trips → 1), verrou advisory et `UPDATE ... WHERE status='available' RETURNING id` **strictement inchangés** (seule vraie garantie anti-double-réservation).
- Gestion d'erreur dédiée : saturation pool/pooler → `503 service_overloaded` au lieu d'un `500` générique.
- `backend/loadtest-seed-pro.ts` : 1 pro → N pros paramétrable (10-15 pour ces tests), trafic réservation réparti.

**Preuve de non-régression sur la concurrence** (`backend/loadtest-concurrency-test.ts`, contre la vraie DB, pas de mock) :
- N=20 requêtes simultanées sur le même créneau → 1×200, 19×409, **1 ligne en base**
- N=50 requêtes simultanées → 1×200, 49×409, **1 ligne en base**
- Reproductible à la demande : `node_modules/.bin/ts-node backend/loadtest-concurrency-test.ts <N>`

**Gain mesuré** (même palier 50 VUs, avant/après) :

| | Avant (1 pro, 6 round-trips) | Après (10 pros, 4 round-trips) |
|---|---|---|
| `booking_error_rate` | 31,5% | 0,66% → **0,00%** à 300-500 VUs |
| p95 booking | 1,9-2,5s | **~900ms**, stable de 50 à 500 VUs |

### 2.2 Pool DB — `max: 40` était incohérent avec la vraie limite Supabase

**Découvert en poussant le test de concurrence à N=50** :
```
(EMAXCONNSESSION) max clients reached in session mode — max clients are limited to pool_size: 20
```
Le Session Pooler Supabase (utilisé en local, faute d'IPv6 sortant sur ce réseau) a son **propre plafond dur à 20 connexions**. `max: 40` ne queue pas au-delà de cette limite — le pooler **rejette sèchement**.

**Vérifié et rassurant** : la prod réelle utilise la connexion **directe** (`.env.prod`), pas ce pooler — ce plafond de 20 est propre à l'environnement de test local, sans impact sur la vraie prod.

**Correction** (`backend/lib/db.ts`) : `max` codé en dur → `DB_POOL_MAX` configurable, défaut **15** (marge sous les 20 du pooler local). La vraie limite prod (connexion directe, `max_connections` Postgres du plan Supabase) n'a **pas été devinée** — à vérifier explicitement dans le dashboard avant de fixer `DB_POOL_MAX` en prod (voir §5).

### 2.3 CPU/bcrypt — backpressure au lieu de laisser thrasher

**Cause confirmée à 150 VUs** : `"Database query timed out"` (221 occurrences) alors que le SQL sous-jacent s'exécute en < 1ms — l'event loop, saturé par des `bcrypt.hash/compare(cost=12)` concurrents non bornés, ne traite plus les réponses DB à temps. Le CPU atteint 727-747% (sur 8 cœurs) : c'est un vrai plafond de calcul, pas un bug.

**Décision actée avec toi, respectée** : `cost=12` **inchangé**.

**Correction appliquée** (`backend/lib/concurrency.ts` + `backend/routes/auth.routes.ts`) : sémaphore borné (`BCRYPT_MAX_CONCURRENCY`, défaut 8) autour des 3 appels bcrypt (signup, login, reset-password). Le hash de signup est aussi déplacé **avant** l'acquisition de la connexion DB — un pool connection ne reste plus inactif pendant l'attente CPU.

**Effet mesuré, même palier 150 VUs, avant/après** :

| | Avant | Après |
|---|---|---|
| Erreurs HTTP | 21,11% | **0,00%** |
| signup réussi | 4% | **~100%** |
| p95 booking | 4,41s | 909ms |
| p95 global | 3,62s | 4,72s (plus élevé — mais c'est de la file d'attente honnête, pas des échecs masqués) |

Le sémaphore ne réduit pas le travail CPU total (le plafond physique reste le même) — il transforme un thrashing chaotique et destructeur (échecs en cascade sur du trafic non lié) en dégradation prévisible et sans erreur.

## 3. Progression complète, itération par itération

| # | VUs | Erreurs HTTP | p95 global | p95 lecture | p95 booking | Changement |
|---|---|---|---|---|---|---|
| 7 | — | — | — | — | — | Diagnostic EXPLAIN ANALYZE (pas de run k6) |
| 8 | 50 | 0,02% | 799ms | 126ms | 913ms | Fusion SQL + multi-pros |
| 9 | 150 | 21,11% | 3,62s | 650ms | 4,41s | Rejeu — CPU/bcrypt non contenu (régression visible) |
| 10 | 150 | **0,00%** | 4,72s | 130ms | 909ms | + Sémaphore bcrypt |
| 11 | 300 | **0,00%** | 11,13s | 134ms | 944ms | Confirmation à 2× la charge |
| 12 | 500 | **0,00%** | 19,76s | 134ms | 908ms | Confirmation au palier max autorisé |

**Constat clé** : p95 lecture et p95 booking restent **stables** de 50 à 500 VUs (aucune dégradation avec la charge) — seul le p95 global (tiré par la file d'attente bcrypt) croît avec les VUs, de façon parfaitement linéaire et prévisible, jamais chaotique.

## 4. Pourquoi le p95 global et le CPU restent ❌ — et pourquoi ce n'est pas un échec caché

Ce n'est **pas** un problème de code non résolu : c'est le plafond physique d'**un seul process Node sur une seule machine**, avec un paramètre de sécurité (`bcrypt cost=12`) volontairement préservé. Deux faits le prouvent :

1. Le CPU plafonne à ~700-750% sur une machine 8 cœurs (87-94% d'utilisation totale) — pas de marge physique restante sur ce process.
2. Le débit d'auth (signup+login) est resté stable (~19-21 itérations/s) quel que soit le nombre de VUs au-delà de 150 — signe clair de saturation, pas de bug qui s'aggrave.

La seule vraie solution est le **scaling horizontal** (plusieurs process/instances), pas un patch de code supplémentaire sur ce process.

## 5. Plan d'infrastructure pour valider 3 000 VUs (staging requis)

### 5.1 Pourquoi le test n'est pas allé plus loin

- **Pas de staging Supabase séparé** — dev et prod partagent le même projet (`zjcpteyjbifxymunjdig`). Le protocole de sécurité de cette mission interdit explicitement tout test agressif au-delà de ce qui a été fait (500 VUs, en restant sous les seuils d'alerte à tout moment) sans staging isolé.
- **CPU d'un process unique déjà quasi saturé à 500 VUs** — pousser plus loin sur cette même machine ne testerait que la profondeur de la file d'attente, pas la capacité réelle d'une architecture à plusieurs instances.

### 5.2 Prérequis avant de pouvoir tester 3 000 VUs pour de vrai

1. **Projet Supabase de staging dédié**, données synthétiques, quotas propres — zéro risque de contention avec `app.blyssapp.fr`.
2. **Backend déployé sur plusieurs instances/process**, derrière un load balancer (pas un `ts-node` local).
3. **`DB_POOL_MAX` calculé, pas deviné** : récupérer le `max_connections` réel du plan Supabase du staging (dashboard → Database → Connection info), diviser par le nombre d'instances prévues, garder une marge (~20%) pour les scripts d'admin/migration.
4. **`UV_THREADPOOL_SIZE=16`** répliqué comme variable d'env du déploiement (actuellement testé en local seulement, jamais posé en prod).
5. **`BCRYPT_MAX_CONCURRENCY`** ajustable par instance selon le nombre de cœurs alloués (défaut 8, à recalibrer si les instances ont moins/plus de vCPU).

### 5.3 Estimation de capacité (hypothèses explicites)

Mesuré sur cette machine (8 vCPU) : ~19-21 itérations/s soutenues à saturation CPU, chaque itération = 1 login (bcrypt.compare) minimum.

**Hypothèse posée, à valider** : en usage réel, un utilisateur ne se reconnecte pas à chaque action (contrairement à mon scénario de test qui fait 1 login par itération pour isoler l'endpoint) — un ratio réaliste serait de l'ordre de 1 login pour 10-20 actions (session token réutilisé). Sous cette hypothèse, le débit de logins nécessaire pour 3 000 utilisateurs simultanés actifs serait très inférieur à 3 000 logins/s — probablement de l'ordre de quelques dizaines à une centaine/s selon le taux de renouvellement de session réel de l'app (**à mesurer via les vraies analytics PostHog/Sentry avant de dimensionner**, pas à deviner).

**Nombre d'instances** (formule, pas un chiffre définitif tant que le ratio ci-dessus n'est pas confirmé) :
```
instances_nécessaires = (débit_login_cible_reqs/s réel) / (~19-21 logins/s par instance à 8 vCPU)
                         × marge de sécurité (recommandé : 1,5-2×)
```
Avec l'hypothèse prudente "quelques dizaines de logins/s" pour 3 000 utilisateurs actifs : **2 à 4 instances à 8 vCPU** couvriraient large avec marge. Ce chiffre doit être recalculé dès que le vrai ratio session/login de l'app est connu.

### 5.4 Observabilité requise avant le test à 3 000 VUs

- Health checks par instance (déjà présent : `GET /api/health`, à brancher sur le load balancer).
- Autoscaling basé sur CPU (seuil ~70% pour anticiper avant saturation, vu le comportement en marches d'escalier observé ici).
- Dashboards : CPU/RAM par instance, connexions actives par pool, p95/p99 par endpoint, taux d'erreur, profondeur de la file du sémaphore bcrypt (`bcryptSemaphore.stats` déjà exposé dans le code, pas encore branché à un exporteur de métriques).
- Alertes actionnables : CPU > 80% soutenu 5 min, erreurs > 1% sur 1 min, p95 > 500ms sur 5 min.

### 5.5 Protocole prêt à l'emploi dès que le staging existe

Réutiliser tel quel :
- `loadtest/scenarios/mixed.js` (`BASE_URL` pointé vers le staging, `VUS` monté progressivement 500 → 1000 → 2000 → 3000)
- `backend/loadtest-seed-pro.ts <N>` (augmenter N proportionnellement aux VUs pour éviter toute contention artificielle — règle empirique validée ici : ~1 pro pour 30-50 VUs)
- `backend/loadtest-cleanup.ts` après chaque palier
- `backend/loadtest-concurrency-test.ts` en test de non-régression avant chaque campagne

## 6. Checklist des optimisations appliquées cette phase

- [x] Fusion de 3 requêtes SQL en 1 CTE (réservation) — round-trips 6 → 4
- [x] Contention artificielle éliminée (1 pro → N pros dans le scénario de test)
- [x] Pool DB : valeur incohérente avec Supabase (40) → configurable et documentée (15 par défaut, cohérence à vérifier en prod)
- [x] Gestion d'erreur 503 dédiée pour saturation transitoire (pool/pooler/DNS)
- [x] Sémaphore borné sur bcrypt (signup/login/reset-password) — backpressure sans toucher cost=12
- [x] Hash de signup déplacé hors de la connexion DB tenue
- [x] Test de concurrence dédié, contre la vraie DB, prouvant l'absence de double-réservation (N=20 et N=50)
- [x] 168/168 tests unitaires/intégration toujours verts après toutes les modifications
- [ ] **À faire** : `UV_THREADPOOL_SIZE=16` et `DB_POOL_MAX`/`BCRYPT_MAX_CONCURRENCY` à poser réellement en prod (testés en local uniquement)
- [ ] **À faire** : mesurer le vrai ratio login/session de l'app (PostHog/Sentry) pour affiner l'estimation de capacité du §5.3
- [ ] **À faire** : staging Supabase dédié — bloquant pour tout test au-delà de 500 VUs
- [ ] **À faire** : exposer `bcryptSemaphore.stats` (déjà codé) vers un système de métriques

## 7. État du code

Tout est nettoyé côté données (base confirmée vide de tout compte `loadtest-`, y compris les pros fixtures). 168/168 tests passent, typecheck propre. Rien n'est commité — fichiers modifiés/créés cette phase :

- `backend/server.ts` — fusion requêtes réservation + gestion erreur 503
- `backend/lib/db.ts` — `DB_POOL_MAX` configurable (défaut 15)
- `backend/lib/concurrency.ts` — nouveau, sémaphore générique
- `backend/routes/auth.routes.ts` — sémaphore bcrypt sur 3 endpoints
- `backend/__tests__/bookings.test.ts` — mocks adaptés à la requête fusionnée
- `backend/loadtest-seed-pro.ts` — réécrit pour N pros (au lieu de 1)
- `backend/loadtest-cleanup.ts` — pattern d'exclusion pro mis à jour
- `backend/loadtest-concurrency-test.ts` — nouveau, preuve anti-double-réservation
- `loadtest/scenarios/mixed.js` — lit `loadtest/pros.json`, répartit les réservations
