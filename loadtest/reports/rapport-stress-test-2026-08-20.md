# Rapport de stress test — Blyss backend

## 1. Résumé exécutif

```
OBJECTIF INITIAL   : 3 000 utilisateurs simultanés (médiane de la fourchette "ambitieuse à 12 mois")
ITÉRATIONS         : 6
RÉSULTAT FINAL     : ⚠️ Objectif partiellement atteint

- Backend p95 (lecture)      : 126-256ms jusqu'à 150 VUs (objectif : < 500ms) ✅
- Backend erreurs HTTP       : 0,02% à 50 VUs, 7,9% à 150 VUs (objectif : < 1%) ✅ à 50, ❌ à 150
- Backend p95 (global)       : 840ms à 50 VUs, 4,42s à 150 VUs (objectif : < 500ms) ❌
- CPU max                    : 732% à 150 VUs sur process unique (plafond réel identifié)
- 3 000 VUs réels            : non testé — bloqué par une limite d'infra partagée, pas de code (détail §5)
```

Deux bottlenecks **réels et corrigés** en cours de route. Le plafond restant (au-delà de ~100-150 utilisateurs concurrents sur *un seul* process local) est un besoin de **scaling horizontal**, pas un bug — confirmé par un CPU qui monte à 732% pendant que les temps de réponse explosent, sur une charge de connexion (bcrypt) qu'on a délibérément choisi de ne pas affaiblir.

## 2. Progression itération par itération

| # | VUs | Erreurs HTTP | p95 global | p95 lecture | Bottleneck |
|---|---|---|---|---|---|
| 1 | 50 | 98,3% | 15,6s | 5,2s | Mode "Management API" (réseau local, pas de vraie DB) |
| 2 | 50 | 40,2% | 15,3s | 5,0s | Pool DB par défaut = 10 connexions |
| 3 | 50 | 0% | 854ms | 125ms | Créneaux de réservation inexistants (fixture obsolète) |
| 4 | 50 | 0,02% | 840ms | 126ms | Login (bcrypt cost=12) domine le p95 par volume |
| 5 | 300 | 78,5% | 10s | 10s | Pool DB (max:20) de nouveau saturé |
| 6 | 150 | 7,9% | 4,42s | 256ms | CPU (bcrypt) — plafond réel du process unique |

## 3. Bottlenecks rencontrés et solutions

| Problème | Solution | Gain |
|---|---|---|
| Pool `pg` sans `max` explicite (défaut node-postgres = 10) → 68% d'échecs "timeout exceeded when trying to connect" à 50 VUs, CPU quasi idle pendant ce temps (signature classique de pool saturé) | `max: 20` puis `max: 40` dans `backend/lib/db.ts` | 68% d'erreurs → 0% à 50 VUs ; tient jusqu'à ~100-150 VUs propres |
| `UV_THREADPOOL_SIZE` par défaut (4) → seuls 4 `bcrypt.hash()` en parallèle sur une rafale de signups concurrents | `UV_THREADPOOL_SIZE=16` au lancement du process | Signups en rafale beaucoup mieux absorbés |
| Fixture pro (`camille@blyss.dev`) sans créneau disponible sur aucune date testée (J+1 à J+30) | Pro 100% jetable créé (`backend/loadtest-seed-pro.ts`), 240 créneaux sur 30 jours | Parcours réservation validé : 99% de succès à 50 VUs |
| CPU saturé (732% à 150 VUs) par `bcrypt.compare`/`bcrypt.hash` à cost=12 | **Décision produit prise avec toi : on ne touche pas au cost factor** (paramètre de sécurité). Le vrai fix est le scaling horizontal en prod (plusieurs process/instances derrière un load balancer), pas une modification de code locale. | — (hors scope de ce qu'on peut corriger localement) |

## 4. Pourquoi 3 000 VUs n'a pas été testé directement

Trois obstacles d'infrastructure, aucun de code :

1. **Pas de staging séparé** — un seul projet Supabase sert dev et prod. Toute charge testée localement partage les mêmes ressources DB que les vrais utilisateurs Blyss.
2. **DNS/réseau local sans IPv6** — la connexion directe Postgres de Supabase est IPv6-only ; il a fallu activer le Session Pooler (IPv4) côté dashboard Supabase pour obtenir un mode `pg` représentatif (sans quoi le backend retombe sur la Management API, faite pour le dashboard admin, pas pour du trafic applicatif).
3. **Le pool de connexions local partage le vrai pooler de prod** — pousser `max` à une valeur permettant réellement 3000 connexions simultanées consommerait des ressources sur l'infra dont dépend aussi `app.blyssapp.fr` en ce moment. On s'est arrêté à un palier prudent (`max: 40`, testé jusqu'à 150 VUs) plutôt que de risquer d'affamer la vraie prod pour un test local.

**Ce qu'il faudrait pour valider 3000 VUs pour de vrai** : un environnement de staging Supabase dédié (projet séparé, pas de risque de contention avec la prod) + le backend déployé sur une vraie infra scalable (pas un process `ts-node` local) + plusieurs instances/process derrière un load balancer pour dépasser le plafond CPU d'un seul process Node.

## 5. Checklist des optimisations appliquées

- [x] Pool `pg` : `max: 10` (implicite) → `max: 40` (`backend/lib/db.ts`)
- [x] `UV_THREADPOOL_SIZE` documenté comme levier opérationnel (16 utilisé en test — à fixer en variable d'env de déploiement, pas encore fait pour la prod réelle)
- [x] Fixture de test réservation créée et outillée (`backend/loadtest-seed-pro.ts`, jetable)
- [x] Script de nettoyage post-test (`backend/loadtest-cleanup.ts`) — toutes les données de test étaient préfixées `loadtest-`, base confirmée vide après chaque itération
- [x] Bypass de rate-limiting pour tests locaux, opt-in et double-verrouillé (`middleware/rate-limits.ts`, jamais actif en prod)
- [ ] **À faire** : scaling horizontal en prod (cluster Node / plusieurs instances) — nécessaire pour dépasser ~150 utilisateurs concurrents réels
- [ ] **À faire** : investiguer le endpoint réservation isolément (p95 ~1,9-2,5s même à charge modérée — verrou `pg_advisory_xact_lock` + transaction multi-requêtes, jamais creusé en profondeur faute de temps)
- [ ] **À faire** : staging Supabase dédié pour permettre un futur test à 3000 VUs sans risque pour la prod

## 6. Recommandations long terme

- Fixer `UV_THREADPOOL_SIZE=16` (ou plus) comme variable d'environnement standard du déploiement prod, pas seulement en test.
- Monitorer en prod : CPU du process Node, nombre de connexions actives sur le pool, temps de réponse p95/p99 par endpoint (dashboards + alertes).
- Avant toute campagne marketing/pic de lancement prévu, refaire ce test sur un vrai staging pour calibrer le nombre d'instances nécessaires.
- Envisager de créer un projet Supabase de staging distinct — bénéfice qui dépasse largement le cadre des stress tests (sécurité, tests d'intégration sans risque, etc.).
