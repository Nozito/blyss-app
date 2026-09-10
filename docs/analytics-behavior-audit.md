# Module « Analytics / Comportement » — audit de faisabilité

_Date : 2026-09-10 — périmètre : blyss-app (backend + dashboard admin web) + blyss-mobile (émission des events)._

But du document : avant d'écrire une ligne du module, établir **ce qui est calculable
aujourd'hui**, **ce qui est approximable**, et **ce qui manque** (events / colonnes /
tables). Aucune métrique du module ne devra afficher une valeur inventée : soit une
donnée réelle, soit un état `Donnée indisponible` avec la liste des prérequis.

---

## 1. Sources de données existantes

### 1.1 Base de données (Supabase / Postgres prod) — 40 tables

| Domaine | Tables utiles | Ce qu'on en tire |
|---|---|---|
| Utilisateurs | `users` (72) | inscription (`created_at`), rôle, `pro_status`, ville, `latitude/longitude`, `last_login_at`, `specialty`, `uses_availability_engine`, `stripe_onboarding_complete`, `monthly_objective` |
| Réservations | `reservations` (991) | `created_at`, `start_datetime`, `status`, `price`, `total_paid`, `deposit_amount`, `is_no_show`, `cancelled_by`, `booking_source` (`client`/`pro` uniquement), `prestation_id`, `client_id`, `pro_id`, `timezone` |
| Paiements | `payments` (525) | `amount`, `status`, `type` (deposit/balance/…), `created_at`, `refund_amount`, `stripe_*` |
| Abonnements | `subscriptions` (4), `revenuecat_events` (1) | plan, `billing_type`, `monthly_price`, `status`, `start_date`/`end_date`, `payment_id` (source), `created_at`/`updated_at` (proxy résiliation) |
| Offre | `prestations` (54), `working_hours` (96), `unavailabilities` (1), `gallery_images` (4), `pro_nail_styles` (0) | catalogue, amplitude horaire, prix, durée, `is_online_bookable` |
| Engagement | `favorites` (18), `reviews` (56), `message_threads` (4), `messages` (16), `waiting_list` (0), `reschedule_requests` (0) | favoris (avec `created_at`), avis (note + date, **pas de lien réservation**), messagerie (volume + `last_message_at`) |
| Onboarding client | `client_onboarding` (4), `client_preferences` (3) | `started_at`/`completed_at`/`skipped_at`, `current_step`, `recommendations_viewed`, `cta_tapped`, `acquisition_source` (texte libre), styles/ville souhaités |
| Divers | `audit_log` (369), `admin_audit_log` (4), `finance_reports` (16) | `audit_log` = **purge RGPD cron uniquement**, pas du comportement. `admin_audit_log` = actions admin. |

> Volumétrie faible (72 users, 4 abos, 4 threads) → toutes les métriques « taux » seront
> bruitées. Le module doit afficher les **effectifs** à côté de chaque pourcentage et
> masquer/estomper un ratio calculé sur < N (proposé : N = 20).

### 1.2 Analytics produit — PostHog (déjà en place, partiellement)

- `posthog-react-native@4.63` monté dans `blyss-mobile/app/_layout.tsx`.
- Projet **EU cloud** (`https://eu.i.posthog.com`), clé projet `phc_nGa5…` (write-only,
  présente dans `eas.json` sur les 3 profils + `.env.local`).
- Ce qui est **réellement capturé aujourd'hui** :
  - `posthog.screen(pathname)` à **chaque changement de route** (`usePathname()`),
    autocapture des taps **désactivée** (`autocapture={{ captureScreens: false }}`).
  - `posthog.identify(user.id, { role, is_admin, pro_status })` à la connexion,
    `posthog.reset()` à la déconnexion.
  - **11 events métier `onboarding_*`** émis depuis `app/client-onboarding.tsx`
    (`onboarding_started`, `_preferences_selected`, `_recommendations_viewed`,
    `_pro_followed`, `_notif_prompted`, `_notif_result`, `_cta_tapped`, `_completed`,
    `_skipped`, `_resumed`, `_attribution`). Cf. `docs/client-onboarding-tracking.md`.
- Ce qui **n'existe pas** :
  - aucun event métier hors onboarding (recherche, vue profil, vue prestation, vue
    créneau, début/confirmation résa côté client ; publication profil, résa reçue/
    acceptée/refusée, ouverture calendrier côté pro) ;
  - **pas de `posthog-node` côté backend** → les events serveur (paiement, webhook RC,
    résa confirmée) ne partent pas dans PostHog ;
  - **pas de Personal API Key PostHog ni de project id** configurés → le dashboard admin
    **ne peut pas lire** les données PostHog aujourd'hui (il faudrait un proxy HogQL
    backend authentifié par personal key).
  - `first_appointment_booked` (spécifié dans le doc onboarding) **n'est pas émis**.

### 1.3 Attribution / acquisition

- **Aucune** attribution technique (pas de deferred deep link / AppsFlyer / Branch /
  Adjust, pas d'`install_referrer`, pas d'UTM).
- Seule donnée : `client_onboarding.acquisition_source` = **déclaratif**, texte libre,
  une question dans l'onboarding client (`instagram|tiktok|amie|prothesiste|google|pub`).
  Rempli pour 3 clients sur 4 lignes. **Rien pour les pros.**
- Conséquence directe : **CAC par canal, LTV par canal, churn par canal = infaisables**
  sans (a) brancher une source d'attribution, et (b) saisir la dépense marketing par
  canal quelque part (table `marketing_spend` à créer, saisie manuelle mensuelle).

---

## 2. Faisabilité par bloc du cahier des charges

Légende : ✅ calculable maintenant · 🟡 approximation / partiel · ❌ bloqué (prérequis).

### 2.1 Abonnements — « Acquisition → abonnement », churn détaillé, cohortes, LTV

| Demande | Statut | Détail |
|---|---|---|
| MRR / ARR / abonnés actifs / ARPU | ✅ | déjà livré dans `GET /api/admin/subscriptions/analytics` (PR #63) |
| Churn mensuel, rétention brute | 🟡 | approx via `status='cancelled'` + `updated_at` (pas de log d'événement d'abo ; `revenuecat_events` ne garde que `event_id/type/user_id/processed_at`) |
| **Churn par ancienneté** (0-30j, 31-90j, 3-6m, …) | 🟡 | faisable sur `start_date → updated_at` des abos résiliés, mais **4 abos en base** → non significatif avant plusieurs mois |
| **Cohortes d'abonnement** M0…M12 | 🟡 | SQL faisable (`generate_series` sur mois de `start_date`), livrable en tant que structure ; données vides tant que le volume ne monte pas |
| Nb renouvellements par abo | ❌ | on ne stocke pas les renouvellements. `revenuecat_events` capte `RENEWAL` mais **n'historise pas** (1 ligne, écrasée). → **Prérequis : garder toutes les lignes `revenuecat_events` + un compteur.** |
| Source / canal / campagne par abo | ❌ | pas d'attribution pro (cf. 1.3) |
| CAC par canal | ❌ | pas d'attribution + pas de table de dépense marketing |
| LTV par canal | ❌ | dépend des deux ci-dessus |
| LTV depuis cohortes réelles | 🟡 | méthode OK (survie par cohorte × ARPU), données insuffisantes aujourd'hui |
| Par personne qui résilie : mois abonnés, plan, prix, **réservations reçues, clientes obtenues, CA généré** | ✅ | jointure `subscriptions → users → reservations/payments` : tout ça est calculable |
| Usage de l'app (sessions, jours actifs) pour un résilié | ❌ | pas d'events de session (cf. 3) |
| Motif de résiliation | ❌ | jamais demandé. **Prérequis : écran « pourquoi partez-vous ? » à l'annulation + colonne `subscriptions.cancellation_reason`.** |
| Promotions utilisées | ❌ | système coupons supprimé (mort), Offer Codes ASC non tracés côté Blyss |

### 2.2 Comportement clientes — funnel, recherche, vues profil, cohortes

| Demande | Statut | Détail |
|---|---|---|
| Clientes actives / nouvelles / MAU-WAU-DAU | 🟡 | « nouvelles » = ✅ (`users.created_at`, role client). « actives / DAU / WAU / MAU » = ❌ au sens session — **proxy possible** : cliente ayant créé une résa OU un favori OU un message sur la période (activité *transactionnelle*, pas *d'usage*). À étiqueter « activité produit » et non « DAU ». |
| Sessions / cliente, durée de session | ❌ | PostHog capte des `screen` mais aucune session n'est reconstituée côté Blyss ; pas de proxy DB |
| Nb de recherches, recherches par ville/prestation/prix/date | ❌ | **aucun event de recherche**. C'est le plus gros manque. |
| Nb de profils consultés, temps sur profil, photos/avis/prix/dispo consultés | ❌ | aucun event de vue |
| Funnel installation→…→réservation | 🟡 | **bas du funnel seulement** : `reservations` (créée / confirmée / réalisée / annulée / no-show) + `client_onboarding` (installé→inscrit→onboardé). Tout le milieu (recherche→profil→prestation→créneau→booking_started) = ❌ |
| « Demandes non satisfaites » (recherche sans résultat, zone à forte demande / faible offre) | 🟡 | pas via la recherche (pas d'event). **Approche DB alternative** : croiser `client_preferences.city` (ville souhaitée) et `waiting_list` avec l'offre `users(role=pro, pro_status=active)` par ville → « villes désirées sans offre ». Utile mais partiel. |
| Profil → booking conversion (vues → résas par pro) | ❌ (vues) / ✅ (résas) | numérateur OK, dénominateur = vues profil manquant |
| Réservations : par jour/sem/mois, 1re/2e/3e, même pro / autre pro, délai entre RDV, annulations, no-show, reprogrammations | ✅ | `reservations` + `reschedule_requests` couvrent tout ça |
| **Repeat Booking Rate**, **Time To Second Booking** | ✅ | calcul direct sur `reservations` (`ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY start_datetime)`) |
| **Cohortes clientes** (mois de 1re résa → rétention M1…M12) | ✅ | 991 résas, ~vraie volumétrie → **cohortes clientes exploitables dès maintenant** |
| Rétention cliente par ville / pro / prestation | ✅ | jointures dispo |
| Rétention par canal d'acquisition | 🟡 | uniquement pour les clientes ayant une ligne `client_onboarding.acquisition_source` (4 aujourd'hui, ça montera) |

### 2.3 Comportement pros — funnel, activité, prestations, score

| Demande | Statut | Détail |
|---|---|---|
| Nb pros, actives, nouvelles | 🟡 | totaux ✅. « actives » au sens usage ❌ → proxy : pro avec ≥1 résa reçue OU ≥1 modif catalogue/horaires sur la période, OU `last_login_at` récent (colonne remplie à la connexion, 10/72 aujourd'hui, se remplit avec le temps) |
| Pros ayant publié profil / ≥1 prestation / des dispos / ≥1 résa / ≥5 résas | ✅ | `users` + `prestations` + `working_hours` + `reservations` ; « profil publié » ≈ `profile_visibility='public'` (colonne présente) |
| Funnel pro installation→…→abonnement | 🟡 | milieu calculable via **état DB** (profil complété, prestation ajoutée, prix, dispos, 1re vue ❌, 1re résa ✅, 5e/10e résa ✅, abo ✅). Les étapes « installation / inscription » précises et « 1re vue profil » manquent. |
| **Time To First Booking** (inscription → 1re résa reçue) + moyenne / médiane / P25 / P75 / distribution | ✅ | `MIN(reservations.created_at) - users.created_at` par pro, percentiles via `PERCENTILE_CONT` |
| Activité par pro : connexions, jours actifs, sessions | ❌ | pas d'events ; `last_login_at` = dernière connexion seulement (pas un historique) |
| Activité par pro : résas reçues/acceptées/refusées, annulations, clientes uniques/nouvelles/récurrentes, prestations vendues, CA, créneaux dispo/réservés, **taux de remplissage** | ✅ | tout via `reservations` + `working_hours` + `prestations` + `payments`. Taux de remplissage = heures réservées / heures ouvrées sur la période. |
| **Score d'activité / engagement** pro (transparent, basé données réelles) | ✅ | composable à partir des signaux DB ci-dessus ; formule à documenter dans le code (pas de boîte noire) |
| Analyse prestations : vues ❌, réservations ✅, conversion ❌, prix moyen ✅, durée ✅, CA ✅, annulation/récurrence par prestation ✅ | 🟡 | tout sauf « vues » et « conversion vue→résa » |

### 2.4 Marketplace — vue croisée offre / demande

| Demande | Statut | Détail |
|---|---|---|
| Demande : recherches, recherches sans résultat, demande par zone/prestation | ❌ | dépend des events de recherche |
| Demande : clientes actives (transactionnel) | 🟡 | proxy activité |
| Offre : pros actives / disponibles, prestations dispo, créneaux dispo | ✅ | `users` + `prestations` + `working_hours` (− `reservations` − `unavailabilities`) |
| Matching : profils→réservations, demandes satisfaites | 🟡 | « résa par pro / vues » ❌ ; « clientes ayant fini par réserver » ✅ |
| **Supply/Demand ratio par ville** | 🟡 | offre par ville ✅ ; demande = `client_preferences.city` + `waiting_list` + (à terme) recherches. Version v1 : offre vs nb de clientes déclarant vouloir cette ville. |
| % pros ayant reçu ≥1 résa | ✅ | direct |
| % clientes ayant réservé ≥1 fois | ✅ | direct |

### 2.5 Prédiction churn / rétention pro, segmentation, User 360

| Demande | Statut | Détail |
|---|---|---|
| Segments pro Healthy / At Risk / Dormant / Churned | ✅ | règles sur signaux DB (résas 30/60/90j, `last_login_at`, statut abo). Règles **configurables + documentées** dans le code. |
| Segments clientes New / Active / Repeat / Dormant / Churned | ✅ | idem sur activité transactionnelle |
| « Comportements qui prédisent le churn / la rétention » + corrélations | 🟡 | faisable en **descriptif** (comparer les moyennes de chaque signal entre segments) — **pas** de modèle ; afficher « corrélation, pas causalité ». Volume faible → à afficher avec prudence / intervalle. |
| Renouvellement M1/M3/M6/M12 vs variables du 1er mois | 🟡 | méthode OK, données insuffisantes (4 abos) — livrer la vue, elle se remplira |
| **User 360** (cliente & pro) | ✅ | l'essentiel existe déjà dans `GET /api/admin/users/:id` (bloc `pro_activity`) + `UserDetailDialog`. À étendre : favoris, historique réservations complet, timeline d'événements (construite depuis les tables : inscription, 1re résa, chaque résa, chaque avis, abo, résiliation…). Les events d'usage (recherches, vues) manqueront dans la timeline. |
| Risque de churn affiché sur la fiche | ✅ | = segment calculé ci-dessus |

### 2.6 Filtres globaux demandés

| Filtre | Statut |
|---|---|
| Période, comparaison 2 périodes, jour/semaine/mois | ✅ |
| Nouvelle vs ancienne utilisatrice | ✅ (`created_at`) |
| Ville / zone | ✅ (`users.city`, `client_preferences.city`) — normalisation ville à prévoir (texte libre) |
| iOS / Android | ❌ (pas stocké ; PostHog l'a via `$os`, pas la DB) |
| Version de l'app | ❌ (idem PostHog `$app_version`) |
| Source d'acquisition | 🟡 (clientes déclaratif seulement) |
| Type de profil pro / `specialty` | ✅ (`users.specialty`) |

---

## 3. Ce qu'il manque — liste actionnable

### 3.1 Events manquants (à émettre — client)

`distinct_id = user.id`. Convention `snake_case`. Émis côté **mobile** sauf mention backend.

| Event | Quand | Propriétés | Priorité |
|---|---|---|---|
| `client_search_performed` | résultat d'une recherche rendu | `query_text?`, `city`, `styles[]`, `price_min?`, `price_max?`, `date?`, `results_count`, `filters_used[]` | **P0** — débloque tout le haut du funnel + demandes non satisfaites |
| `client_search_zero_results` | recherche renvoyant 0 résultat | `city`, `styles[]`, `filters_used[]` | P0 |
| `pro_profile_viewed` | ouverture d'une fiche pro | `pro_id`, `from` (`search`/`favorite`/`deep_link`/`onboarding`), `position?` | **P0** — conversion profil→résa |
| `service_viewed` | ouverture d'une prestation | `pro_id`, `prestation_id`, `price` | P1 |
| `availability_viewed` | ouverture du calendrier de résa d'un pro | `pro_id`, `prestation_id` | P1 |
| `booking_started` | entrée dans le tunnel de résa (créneau choisi) | `pro_id`, `prestation_id`, `slot_datetime` | **P0** — dernière marche avant `reservations` |
| `booking_abandoned` | sortie du tunnel sans confirmer | `pro_id`, `step` | P1 |
| `favorite_added` / `favorite_removed` | tap ♥ | `pro_id`, `from` | P2 (doublonne `favorites.created_at`, utile pour le « from ») |
| `review_prompt_shown` / `review_submitted` | après RDV | `pro_id`, `reservation_id`, `rating?` | P2 |
| `client_app_opened` | foreground app (rôle client) | `days_since_signup` | P1 (permet DAU/WAU/MAU réels) |

### 3.2 Events manquants — pro

| Event | Quand | Propriétés | Priorité |
|---|---|---|---|
| `pro_app_opened` | foreground app (rôle pro) | `days_since_signup`, `pro_status` | **P0** (DAU pro, signal anti-churn n°1) |
| `pro_profile_published` | passage `profile_visibility` → public | — | P1 (doublonne un état DB → colonne `published_at` suffirait) |
| `pro_service_created` / `pro_service_updated` | CRUD prestation | `prestation_id`, `price`, `duration` | P2 (déjà dans `prestations.created_at/updated_at`) |
| `pro_availability_updated` | modif `working_hours` / `unavailabilities` | — | P2 (déjà horodaté en DB) |
| `pro_calendar_opened` | ouverture de l'agenda | — | P1 (engagement) |
| `pro_booking_received` / `_accepted` / `_rejected` | changement statut résa | `reservation_id`, `delay_seconds?` | **P0** émis **backend** (`posthog-node`) — réactivité pro = signal fort |
| `pro_client_message_sent` | envoi message | `thread_id` | P2 (déjà en DB) |

### 3.3 Events serveur (backend `posthog-node`)

| Event | Où | Propriétés |
|---|---|---|
| `subscription_started` | webhook RC `INITIAL_PURCHASE` (`server.ts`) | `plan`, `billing_type`, `price`, `source` |
| `subscription_renewed` | webhook RC `RENEWAL` | `plan`, `renewal_count` |
| `subscription_cancelled` | webhook RC `CANCELLATION`/`EXPIRATION` + endpoint admin | `plan`, `months_active`, `reason?` |
| `appointment_completed` | passage résa → `completed` (cron ou action) | `pro_id`, `client_id`, `amount`, `is_first_for_client` |
| `payment_succeeded` | webhook Stripe | `amount`, `type` |

### 3.4 Schéma DB — ajouts

| Objet | Raison | Détail |
|---|---|---|
| `subscriptions.cancellation_reason TEXT` + `cancelled_at TIMESTAMPTZ` | motif & date exacte de résiliation (aujourd'hui approximés par `updated_at`) | + écran mobile « pourquoi partez-vous ? » à l'annulation |
| garder l'historique `revenuecat_events` (ne plus écraser) + `renewal_count` | compter les renouvellements, historiser INITIAL/RENEWAL/CANCELLATION | table est déjà là, 1 ligne — vérifier l'`UPSERT` dans `server.ts` |
| `users.signup_platform` (`ios`/`android`/`web`) + `users.signup_app_version` | filtres iOS/Android & version demandés | à remplir à l'inscription (`auth.routes.ts`) depuis un header client |
| `users.acquisition_source` + `acquisition_detail` (pros **et** clientes) | attribution déclarative pro (n'existe pas) ; aligne clientes hors onboarding | question à l'inscription pro |
| table `marketing_spend` (`month`, `channel`, `amount`, `notes`) | CAC par canal — **saisie manuelle mensuelle** dans l'admin | sans ça, aucun CAC possible |
| `reviews.reservation_id` (FK) | lier un avis au RDV (conversion RDV→avis, avis par prestation) | actuellement `reviews` n'a que `client_id`/`pro_id` |
| `users.city` → normalisation | filtres ville fiables | table de référence ville ou normalisation à l'écriture |
| `analytics_daily` (table d'agrégats) | perf : pré-calcul nocturne des séries lourdes (funnels, cohortes) | cf. §4 |

### 3.5 Attribution (si CAC/LTV par canal est vraiment voulu)

Décision produit requise. Options, par ordre de coût :
1. **Déclaratif étendu** (question à l'inscription pro + cliente) + `marketing_spend` manuel
   → CAC/LTV « best effort », gratuit, imprécis mais exploitable.
2. **Deferred deep links** (Branch / AppsFlyer free tier) → attribution technique par
   campagne, ~1 j d'intégration mobile + backend.
3. **Rien** → on abandonne CAC/LTV par canal et on garde LTV/rétention globales + par
   ville / par cohorte (déjà faisable).

---

## 4. Architecture proposée (quand on implémentera)

- **Backend** : un router `analytics.routes.ts` (préfixe `/api/admin/analytics/v2` pour ne
  pas casser les 4 routes `/analytics*` existantes utilisées par `AdminAnalytics.tsx`).
  Endpoints par bloc : `/clients/kpis`, `/clients/funnel`, `/clients/cohorts`,
  `/pros/kpis`, `/pros/funnel`, `/pros/activity`, `/marketplace`, `/segments`,
  `/user-360/:id`, `/insights`, `/data-health`.
- **Requêtes** : SQL agrégé côté Postgres, jamais de données brutes au front. Chaque
  endpoint accepte `from`, `to`, `compare_from`, `compare_to`, `granularity`, `city`,
  `platform`, `cohort`, `segment`.
- **Perf** : ajouter les index (`reservations(created_at)`, `reservations(client_id,
  start_datetime)`, `reservations(pro_id, start_datetime)`, `payments(created_at,
  status)`, `favorites(created_at)`, `subscriptions(start_date)`). Pour funnels/cohortes,
  cron nocturne → `analytics_daily`. Cache HTTP court (5 min) sur les endpoints lourds.
- **PostHog → dashboard** : proxy backend `/api/admin/analytics/v2/product/*` qui
  interroge l'API HogQL de PostHog avec une **Personal API Key** (env
  `POSTHOG_PERSONAL_API_KEY` + `POSTHOG_PROJECT_ID`, à créer). Sépare clairement les
  métriques « DB » des métriques « produit / PostHog ».
- **Front** : nouvelle entrée `Analytics` dans `AdminLayout` avec sous-routes
  `/admin/analytics/clients`, `/admin/analytics/pros`, `/admin/analytics/marketplace`.
  Réutiliser `KpiCard`, `ChartCard`, `ConfirmDialog`, recharts, `ChartContainer`.
  Composant `<MetricValue>` avec 4 états : `real` / `computed` / `estimated` /
  `unavailable` (badge + tooltip listant les prérequis manquants).
- **Insights** : job qui calcule une poignée de règles seuillées (ex. « conversion
  profil→résa +X% », « pros 1re résa < 7 j → rétention M3 supérieure ») **uniquement sur
  les métriques réellement disponibles**, chaque insight affiche les chiffres qui le
  justifient. Pas de NLP, pas d'inventé.

---

## 5. Plan par phases

| Phase | Contenu | Dépend de |
|---|---|---|
| **P0 — data & socle** | `posthog-node` backend + events serveur (§3.3) ; events mobile P0 (§3.1/3.2) ; migrations `cancellation_reason`, `signup_platform`, `reviews.reservation_id`, historisation `revenuecat_events` ; index ; `POSTHOG_PERSONAL_API_KEY` | — |
| **P1 — Analytics DB (60% du besoin, sans nouveaux events)** | funnels bas + état, cohortes clientes, Repeat Booking Rate, Time To 2nd Booking, Time To First Booking pro, activité pro + taux remplissage, segments, Marketplace offre/demande v1, User 360 étendu, data-health page | P0 migrations + index |
| **P2 — Analytics produit (PostHog)** | funnels complets (recherche→profil→prestation→créneau→booking), recherches & demandes non satisfaites, vues profil / conversion, DAU/WAU/MAU réels, filtres iOS/Android & version | events P0 déployés + 2-4 semaines de collecte |
| **P3 — Acquisition & prédictif** | attribution (décision §3.5), `marketing_spend`, CAC/LTV par canal, churn par ancienneté & cohortes d'abo (quand volume suffisant), analyses corrélationnelles descriptives, Key Insights automatiques | P2 + décision attribution + volume abo |

---

## 6. Réponses directes aux questions du brief

- **« 60% des analyses tout de suite ? »** — oui : tout le bloc **réservations /
  rétention cliente / activité pro / marketplace-offre / segments / User 360** est
  calculable sur la DB actuelle (991 résas, vraie volumétrie). C'est la Phase 1.
- **Ce qui manque et qu'on découvre à l'audit** : `booking_started`,
  `pro_profile_viewed`, `client_search_performed` (+ zéro résultat), `pro_app_opened` /
  `client_app_opened`, `subscription_renewed` / `subscription_cancelled` serveur,
  `appointment_completed` serveur. Plus : motif de résiliation, plateforme/version au
  signup, `reviews.reservation_id`, historisation des events RC, et **toute
  l'attribution** (aucune aujourd'hui).
- **Ce qui restera impossible à court terme** : CAC par canal et LTV par canal **tant
  qu'il n'y a ni attribution ni saisie de dépense marketing** ; churn par ancienneté
  **significatif** tant que le nombre d'abonnés est à un chiffre.
