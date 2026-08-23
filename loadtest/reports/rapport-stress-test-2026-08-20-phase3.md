# Rapport de stress test — Blyss backend, phase 3 (staging isolé + multi-instance réel)

Suite directe des phases 1 et 2. Objectif de cette phase : lever tous les indicateurs restants (p95 global, CPU, validation 3000 VUs) en construisant une vraie infrastructure isolée — pas en acceptant les plafonds comme une fatalité.

## 1. Infrastructure réellement construite cette phase

| Composant | Avant | Après |
|---|---|---|
| Staging Supabase | Inexistant | **Créé** : projet `blyss-staging` (ref `rtpamvlohwvibkqflmqz`, eu-west-1), 43 migrations appliquées, secrets distincts (JWT/IBAN), `RESEND_API_KEY` vide (protection anti-email réel) |
| Déploiement backend | Process local `ts-node` | **Railway, 2 instances réelles** (`blyss-staging-backend`, eu-west), load balancer natif Railway, health check `/api/health`, restart policy |
| Config perf en déploiement réel | Jamais posée en dehors du local | `UV_THREADPOOL_SIZE=16`, `BCRYPT_MAX_CONCURRENCY=8`, `DB_POOL_MAX` calculé (voir §3) — tous posés comme variables Railway réelles |
| Deux familles de tests | Un seul scénario mixte (login à chaque itération) | `auth-burst.js` (rafales auth isolées) + `product-mix.js` (session réutilisée via `setup()`, mesure le vrai p95 produit) |
| Test de concurrence | Contre un process local unique | **Rejoué contre les 2 instances Railway réelles** via HTTP (`loadtest-concurrency-remote.ts`) — le load balancer répartit réellement les 50 requêtes entre les 2 process Node |

### Incident détecté et corrigé en cours de route
En reconstruisant le schéma staging via l'historique complet des migrations, la migration `20260313000001_migrate_data.sql` s'est révélée être un **dump réel de l'ancienne base MySQL** (vrais emails/téléphones/IDs Stripe : `noah@dekeyzer.fr`, `admin@blyss.fr`, etc.), pas un seed synthétique. Détecté immédiatement après application, staging purgé (`TRUNCATE users CASCADE`) avant tout test. **0 donnée réelle n'a été exposée à un test de charge.**

### Bug de configuration trouvé et corrigé
Le script `npm start` du backend force `NODE_ENV=production` en dur, ce qui écrasait le `NODE_ENV=staging` posé sur Railway (chargeait le mauvais fichier d'env, désactivait le bypass de rate-limiting nécessaire aux tests). Corrigé via `backend/railway.json` (commande de démarrage dédiée `node dist/server.js`, sans toucher au script partagé dont la vraie prod dépend peut-être).

### Dépendance manquante découverte
`backend/package.json` ne déclarait pas `resend` (utilisé réellement par `lib/email.ts`) — invisible en local car le monorepo hoiste les dépendances depuis la racine. Ajouté explicitement. Les fichiers de test (`__tests__/`) ont aussi été exclus du build de production (`tsconfig.build.json` dédié) pour ne plus exiger `vitest`/`supertest` en prod, sans toucher au `tsconfig.json` utilisé pour la vérification locale complète.

## 2. Résultats mesurés sur l'infrastructure réelle

### Famille 1 — Auth burst isolé (`auth-burst.js`, 100 VUs, signup/login/reset)

| Métrique | Résultat |
|---|---|
| Erreurs (`auth_error_rate`) | **0,00%** (0/3173) — le sémaphore tient même en surcharge |
| CPU | **218% (4,4/2,0 vCPU) — dépasse la limite d'instance** |
| signup p95 / login p95 | 6,28s / 6,25s (budget explicite 3s, dépassé — file d'attente, pas des échecs) |
| forgot_password p95 | 311ms |

**Interprétation** : 100 utilisateurs faisant tous du signup/login simultanément sur 2 instances à 2 vCPU chacune sature réellement le CPU au-delà de sa limite. Zéro crash, zéro erreur — le sémaphore convertit la surcharge en latence, pas en pannes. Confirme noir sur blanc le besoin d'autoscaling pour ce type de trafic, pas un défaut de code.

### Famille 2 — Product mix réaliste (`product-mix.js`, session réutilisée, mesure le p95 produit)

| VUs | p95 global | p95 lecture | p95 réservation | Erreurs HTTP | CPU max |
|---|---|---|---|---|---|
| 100 | **333ms ✅** | **197ms ✅** | **472ms ✅** | 0,00% ✅ | 21,5% ✅ |
| 500 (10 pros, inventaire insuffisant) | 757ms ❌ | 719ms ❌ | 5,56s ❌ | 0,11% ✅ | 21,5% ✅ |
| 500 (40 pros, inventaire corrigé) | 4,94s ❌ | 1,32s ❌ | 9,99s ❌ | 0,05% ✅ | 21,5% ✅ |

**100 VUs est un run entièrement vert** — première fois dans toute cette campagne que le p95 global passe sous 500ms, précisément parce que ce scénario ne mélange pas l'auth (bcrypt) dans la mesure du parcours produit, comme demandé.

**À 500 VUs, le CPU reste à 21,5% dans les trois runs** (jamais plus, y compris le pire run en latence) — la dégradation n'est **pas** liée au calcul. Aucune erreur de timeout ni `EMAXCONNSESSION` dans les logs. La cause identifiée : le pool de connexions DB total (2 instances × `DB_POOL_MAX=6` = 12 connexions) devient le goulot d'étranglement dès plusieurs centaines de VUs concurrents — les requêtes attendent une connexion libre (d'où la latence en hausse sans erreur ni CPU élevé), confirmé par le fait que la latence empire encore quand l'inventaire de test est corrigé (plus de vraies transactions DB en concurrence = plus d'attente sur le pool).

### Test de concurrence réservation — infrastructure multi-instance réelle
```
50 requêtes HTTP simultanées, réparties par le load balancer Railway sur 2 process Node distincts
→ 1 × 200, 49 × 409
→ 1 seule ligne en base pour ce créneau
✅ Aucune double-réservation, y compris à travers 2 instances séparées
```

## 3. Cause racine du plafond, chiffrée

**Ce n'est ni le CPU (21,5% max, marge énorme) ni le code (sémaphore + fusion SQL prouvés efficaces) — c'est un double plafond d'infrastructure/plan, précisément quantifié :**

1. **Session Pooler Supabase (projet staging)** : plafond dur mesuré empiriquement à **15 connexions simultanées** (`(EMAXCONNSESSION) max clients... pool_size: 15`). La connexion directe (sans pooler) a été testée mais échoue au démarrage sur Railway (health check en échec) — non résolu dans le temps imparti.
2. **Plan Railway actuel** : plafond dur à **2 replicas maximum** (`configErrors: "Total replicas across all regions must be less than or equal to 2"`), confirmé en tentant 3.

Avec la formule du brief : `pool_par_instance ≤ (max_connections × 0,80) / nb_instances` → `(15 × 0,8) / 2 = 6` — exactement la valeur posée (`DB_POOL_MAX=6`), et elle sature déjà à 500 VUs.

**Pour atteindre 3000 VUs avec un p95 global < 500ms, il faut lever ces deux plafonds ensemble** (l'un sans l'autre ne suffit pas) :
- Upgrade du plan Supabase (staging) → pooler avec un `pool_size` bien supérieur, ou passage en mode Transaction (multiplexage bien plus efficace que le mode Session actuel)
- Upgrade du plan Railway → dépasser 2 replicas

**Décision prise avec toi** : ne pas engager ces dépenses maintenant. Le plafond est documenté avec les chiffres exacts ci-dessus plutôt que contourné ou maquillé.

## 4. Checklist des indicateurs — état final

| Indicateur | Cible | Résultat mesuré | État |
|---|---|---|---|
| p95 global (scénario produit, 100 VUs) | < 500ms | **333ms** | ✅ |
| p95 lecture (100 VUs) | < 500ms | **197ms** | ✅ |
| p95 réservation (100 VUs) | < 2s | **472ms** | ✅ |
| Erreurs HTTP (tous paliers testés) | < 1% | 0,00-0,11% | ✅ |
| Double-réservation | 0 | 0 (preuve HTTP réelle multi-instance, N=50) | ✅ |
| CPU par instance (produit) | < 80% durable | 21,5% max | ✅ |
| CPU par instance (auth burst isolé) | < 80% durable | **218%** | ❌ (attendu, cf §2) |
| RAM par instance | < 85% durable | 41,5% max | ✅ |
| Pool DB | Pas de saturation durable | Saturé à 500 VUs (12 connexions dispo) | ❌ |
| p95 global à 3000 VUs | < 500ms | **Non testé** | ❌ |
| Nettoyage données de test | Confirmé | ✅ (`--dry-run` : 0 compte restant) | ✅ |
| `UV_THREADPOOL_SIZE`/`DB_POOL_MAX`/`BCRYPT_MAX_CONCURRENCY` en déploiement | Posés | ✅ Posés sur Railway, valeurs mesurées et justifiées | ✅ |
| Observabilité (dashboards + alertes) | En place | Partiel — `railway metrics` donne CPU/RAM/latence/erreurs en direct, mais pas d'alerting configuré (pas de seuils actionnables automatiques) | ⚠️ |

## 5. Ce qui reste à faire, concrètement, pour un futur "🟢 prêt"

1. Décider et exécuter l'upgrade Supabase (staging) + Railway — coût réel, décision produit/business, pas technique
2. Une fois fait : relancer `product-mix.js` en paliers 500 → 1000 → 2000 → 3000 avec `DB_POOL_MAX` recalculé selon la nouvelle limite du pooler
3. Reproduire `auth-burst.js` à plus grande échelle pour dimensionner le nombre d'instances nécessaire à un pic d'auth réaliste (règle d'autoscaling à définir : ce test a montré qu'à 100 VUs purement auth, 2 instances × 2 vCPU sont déjà dépassées)
4. Configurer de l'alerting réel (au-delà de `railway metrics` consultable à la demande) — Railway propose des webhooks de déploiement/santé, à connecter à un canal d'astreinte
5. Étendre `auth-burst.js` pour vérifier explicitement l'absence d'impact croisé sur le trafic produit pendant une rafale auth (les deux scénarios tournant simultanément) — non fait cette phase faute de temps
