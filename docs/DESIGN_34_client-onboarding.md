# DESIGN #34 — Onboarding client nails

Objectif : conversion inscription → 1ᵉʳ RDV nails + rétention, via un onboarding
mobile basé sur des biais psychologiques (preuve sociale, rareté,
micro-engagement, personnalisation).

---

## Découpage en PR

| PR | Contenu | État | Déploiement |
|---|---|---|---|
| **1 — backend** (#35) | migration, routes `/status /preferences /recommendations /complete`, reco v1, cron J+1/J+3/J+7, tests | **mergée** (`572b40f`) | libre |
| **3 — taxonomie pro + reco v2** | `20260907000001` (rename enum + `skipped_at`), routes `/api/pro/nail-styles`, filtrage par style, compteur de créneaux (rareté), `/skip`, tests | **cette PR** | libre (backend). L'éditeur pro = écran mobile, voir PR 2. |
| **2 — mobile iOS** | 5 écrans onboarding + écran « Mes spécialités nails » (pro) + tracking PostHog + push | spec ci-dessous | **après approbation Apple build #20** |

### Décisions produit intégrées (2026-09-04)

1. **Localisation** : saisie manuelle ville / code postal (pas de GPS). Route reco : `?city=`.
2. **Taxonomie pro** : `pro_nail_styles`, saisie par la pro elle-même (écran « Mes spécialités nails »), pas d'admin. Pré-remplissage depuis les prestations = *nice-to-have* non fait (à part).
3. **Mesure conversion** : PostHog (mobile) + cohorte SQL — `docs/client-onboarding-tracking.md`.
4. **Rareté** : vrai compteur de créneaux (moteur de dispo, 7 j) → `open_slots { today, this_week, this_weekend }`.
5. **Copy push** : `docs/client-onboarding-push-copy.md` (v0 générique déployée, variables à câbler par le mobile).
6. **Skippable** : `POST /skip` → `skipped_at`, `completed_at` reste NULL. Reprenable depuis les paramètres. Le cron continue de relancer un onboarding *skippé* (c'est le but des nudges) — il ne s'arrête que sur `completed_at` ou 1ʳᵉ réservation.

### Taxonomie retenue (`nail_style`)

`nail_art | french_nude | couleurs_vives | vernis_gel | pose_resine | autre`

(PR 1 avait `french / gel / resine` ; `20260907000001` fait le `ALTER TYPE … RENAME VALUE`. Aucune donnée en base.)

---

## PR 1 — Backend (livré)

### Schéma — `20260906000001_client_onboarding.sql`

Le ticket proposait 3 tables ; `client_onboarding_completed_at` est un
timestamp, pas une table → fusionné.

- **`client_preferences`** (`client_id` PK, `style_nails` enum, timestamps) — 1 style / client, modifiable.
- **`client_onboarding`** (`client_id` PK, `current_step` 0–5, `started_at`, `completed_at`, `skipped_at` *(PR 3)*, `nudge_d1/d3/d7_sent`).
- **`pro_nail_styles`** (`pro_id`, `style_nails`, PK composite) — vide en PR 1, alimentée via les routes pro de la PR 3.
- enum `nail_style` — valeurs finales après `20260907000001` : `nail_art | french_nude | couleurs_vives | vernis_gel | pose_resine | autre`. Aligné avec `NAIL_STYLES` dans `middleware/validate.ts`.

RLS activée + `REVOKE ... FROM anon, authenticated` (le backend passe en `service_role`, autorisation applicative — cf. `20260807000002`).

### Routes — `routes/client-onboarding.routes.ts`

Montées sous `app.use("/api/client/onboarding", authMiddleware, …)`. Identité
client = `req.user.id` (token), jamais le body. `assertClient()` (rôle DB) sur
les écritures.

| Méthode | Route | Corps / query | Réponse |
|---|---|---|---|
| `GET` | `/status` | — | `{ current_step, completed, completed_at, style_nails }` |
| `POST` | `/preferences` | `{ style_nails }` | `{ style_nails }` — upsert préférence + `current_step ≥ 2` |
| `GET` | `/recommendations` | `?city=` (`?lat=&lng=` réservés) | `{ style_nails, style_matching_active, recommendations[≤3] }` |
| `POST` | `/complete` | — | `{ success }` — fige `completed_at`, `current_step = 5` |

Erreurs : `400` (style invalide, Zod), `401` (pas de token), `403 client_required` (écritures par un non-client), `500`.

### Reco (v2, PR 3)

Candidats : `role='pro' AND pro_status='active' AND is_active AND profile_visibility='public'`.

- **Filtre style** : si le client a une préférence **et** qu'au moins une pro
  (dans le périmètre `city`) a déclaré ce style dans `pro_nail_styles`, on
  restreint la liste à ces pros (`style_filter_active: true`). Sinon on ne
  filtre pas → jamais de liste vide.
- **Filtre géo** : `city ILIKE %…%` si fourni.
- **preuve sociale** : `rating` (AVG avis), `reviews_count`, `bookings_90d` (RDV `completed` 90 j).
- **rareté** : `open_slots { today, this_week, this_weekend }` — vrai comptage
  via `countOpenSlotsForPro()` (moteur de dispo : `working_hours` −
  `unavailabilities` − réservations bloquantes, fenêtre 7 j, pas nominal 45 min).
  Calculé pour les 3 pros retenues seulement.
- **dispo** : `has_availability` = a des `working_hours`.
- **style** : `matches_style` par pro.

Tri : `matches_style` → `has_availability` → `rating × ln(reviews+1)` → `bookings_90d`. `LIMIT 3`.

Le mobile compose les phrases (« ★ 4,8 · 42 avis », « 5 créneaux cette semaine »)
à partir des nombres — le backend ne renvoie que des données.

### Cron `onboarding-nudge` (J+1 / J+3 / J+7)

Même patron que `cron/recall.ts` : `setInterval` horaire, claim
`FOR UPDATE SKIP LOCKED`, `nudge_dN_sent` horodaté (idempotent), respecte
`client_notification_settings.offers`, désactivé si pas de clés VAPID.

Ciblage : `completed_at IS NULL` **ET** `NOT EXISTS (reservation du client)` —
on arrête de relancer dès que le client a réservé. Un onboarding *skippé*
continue d'être relancé (c'est le but). Push web + Expo + ligne `notifications`
(`type = 'onboarding_nudge'`).

Copy : `docs/client-onboarding-push-copy.md`. `NUDGES` dans le cron = v0
générique en attendant que le mobile envoie prénom / ville / compteur.

---

### Routes `/api/pro/nail-styles` (PR 3)

Gate `/api/pro` (auth + `requireProAccess`). `pro_id` = token.

| Méthode | Route | Corps | Réponse |
|---|---|---|---|
| `GET` | `/api/pro/nail-styles` | — | `{ styles: string[] }` |
| `PUT` | `/api/pro/nail-styles` | `{ styles: string[] }` | remplace tout (DELETE+INSERT transactionnel), `{ styles }` trié — **c'est ce qu'appelle l'écran multi-select** |
| `POST` | `/api/pro/nail-styles` | `{ style }` | ajoute (`ON CONFLICT DO NOTHING`), `{ styles }` |
| `DELETE` | `/api/pro/nail-styles/:style` | — | retire, `{ styles }` ; `:style` hors enum → `400 invalid_style` |

---

## PR 2 — Mobile iOS (spec, post-Apple #20)

### A. Onboarding client — 5 écrans (`current_step`)

| # | Écran | Biais | API | Événement PostHog |
|---|---|---|---|---|
| 1 | **Bienvenue** (0→1) — ancrage valeur (« X poses réservées ce mois »), 1 phrase storytelling. Pas d'offre de bienvenue. | preuve sociale | — | `onboarding_started` |
| 2 | **Préférences + localisation** (1→2) — 6 puces `nail_style` (sélection unique) + champ « Où cherches-tu une pro ? » (ville **ou** code postal) + « Continuer ». | micro-engagement | `POST /preferences {style_nails}` (la ville est gardée en local et passée en query à l'écran 3) | `onboarding_preferences_selected` |
| 3 | **Recommandations** (2→3) — `GET /recommendations?city=`. 3 cartes : photo, nom, ★ note · N avis, badge rareté (`open_slots.this_week` → « 5 créneaux cette semaine » ; `today` → « dispo aujourd'hui »), pastille « pour ton style » si `matches_style`. | perso + preuve sociale + rareté | `GET /recommendations` | `onboarding_recommendations_viewed` |
| 4 | **CTA 1ᵉʳ RDV** (3→4) — bouton plein écran vers la fiche/réservation de la 1ᵉʳ reco (ou tap direct sur une carte à l'écran 3). | — | (flux résa existant) | `onboarding_cta_tapped` |
| 5 | **Carousel features** (4→5) — 3 slides max, puis « Terminer ». | — | `POST /complete` | `onboarding_completed` |

- **Skip** : bouton « Plus tard » sur chaque écran → `POST /skip` + `onboarding_skipped {at_step}`. Jamais bloquant.
- **Reprise** : entrée « Reprendre la découverte » dans les Paramètres si `GET /status` → `skipped: true`. `onboarding_resumed`.
- **Lancement app** : `GET /status` → si `current_step > 0 && !completed && !skipped`, reprendre à `current_step`.
- **Localisation** : saisie texte, pas de permission GPS. Validation basique (non vide). Persistée localement pour ré-usage.
- **Push** : opt-in notifications à l'installation ; les relances J+1/3/7 sont côté cron backend, rien à planifier côté app.
- `first_appointment_booked` : émis quand le client confirme son 1ᵉʳ RDV nails (garder l'origine « vient de l'onboarding » jusqu'à la résa).

### B. Écran pro « Mes spécialités nails »

Dans le profil pro (blyss-mobile — pas de web pro, cf. front web = admin only).

- Multi-select des 6 `nail_style` (chips togglables).
- Au montage : `GET /api/pro/nail-styles` → pré-cocher.
- « Enregistrer » → `PUT /api/pro/nail-styles {styles}` → toast de confirmation.
- Gestion erreur réseau : garde l'état local, réessai.
- (Nice-to-have non fait : pré-remplir depuis les prestations existantes.)

### Tracking / doc

- `docs/client-onboarding-tracking.md` — events PostHog, payloads, funnel, cohorte SQL.
- `docs/client-onboarding-push-copy.md` — copies J+1/3/7 + comment les changer.

---

## Dépendances

- Aucun blocage avec #23, #26.
- Migrations `20260906000001` + `20260907000001` : additives (la 2ᵉ fait un
  `ALTER TYPE … RENAME VALUE`, sans données en base).
- Backend (PR 1 + PR 3) déployable sans attendre le mobile : le cron est inactif
  tant qu'aucun `client_onboarding` n'existe, les routes pro nail-styles sont
  inertes tant qu'aucune pro ne les appelle.
