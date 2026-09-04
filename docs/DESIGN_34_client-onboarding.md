# DESIGN #34 — Onboarding client nails

Objectif : conversion inscription → 1ᵉʳ RDV nails + rétention, via un onboarding
mobile basé sur des biais psychologiques (preuve sociale, rareté,
micro-engagement, personnalisation).

---

## Découpage en PR

| PR | Contenu | État | Déploiement |
|---|---|---|---|
| **1 — backend** | migration (tables + enum), 4 routes API, reco v1, cron J+1/J+3/J+7, tests | **cette PR** | libre (aucun risque release ; le cron ne fait rien tant qu'aucun client n'a d'onboarding) |
| **2 — mobile iOS** | 5 écrans, progression, appels API, opt-in push | à faire | **après approbation Apple build #20** |
| **3 — taxonomie pro** (optionnelle) | `pro_nail_styles` + éditeur côté pro | à cadrer | active le filtrage par style de la reco |

---

## PR 1 — Backend (livré)

### Schéma — `20260906000001_client_onboarding.sql`

Le ticket proposait 3 tables ; `client_onboarding_completed_at` est un
timestamp, pas une table → fusionné.

- **`client_preferences`** (`client_id` PK, `style_nails` enum, timestamps) — 1 style / client, modifiable.
- **`client_onboarding`** (`client_id` PK, `current_step` 0–5, `started_at`, `completed_at`, `nudge_d1/d3/d7_sent`).
- **`pro_nail_styles`** (`pro_id`, `style_nails`) — **créée vide**. La reco la LEFT JOIN : tant qu'il n'y a pas de lignes, le style ne filtre pas (juste stocké + ré-affiché). Peuplée par la PR 3.
- enum `nail_style` : `nail_art | french | couleurs_vives | gel | resine | autre` (ticket). Aligné avec `NAIL_STYLES` dans `middleware/validate.ts`.

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

### Reco v1 (sans dépendance à la taxonomie pro)

Une requête. Candidats : `role='pro' AND pro_status='active' AND is_active AND profile_visibility='public'` (+ `city ILIKE` si fourni).

Signal par pro :
- **preuve sociale** : `rating` (AVG avis), `reviews_count`, `bookings_90d` (RDV `completed` sur 90 j)
- **rareté** : `upcoming_14d` (RDV `confirmed`/`pending` dans les 14 j → « agenda déjà bien pris »)
- **dispo** : `has_availability` = a des `working_hours`
- **style** : `matches_style` (via `pro_nail_styles` — `false` partout tant que la table est vide)

Tri : `matches_style` → `has_availability` → `rating × ln(reviews+1)` → `bookings_90d`. `LIMIT 3`.

Le mobile compose les phrases (« ★ 4,8 · 42 avis », « 9 RDV cette quinzaine ») à
partir des nombres — le backend ne renvoie que des données, pas de copy.

### Cron `onboarding-nudge` (J+1 / J+3 / J+7)

Même patron que `cron/recall.ts` : `setInterval` horaire, claim
`FOR UPDATE SKIP LOCKED`, `nudge_dN_sent` horodaté (idempotent), respecte
`client_notification_settings.offers`, désactivé si pas de clés VAPID.

Ciblage : `completed_at IS NULL` **ET** `NOT EXISTS (reservation du client)` —
on arrête de relancer dès que le client a réservé, même si l'onboarding n'a pas
été « complété » dans l'app. Push web + Expo + ligne `notifications`
(`type = 'onboarding_nudge'`).

Copy actuelle (à faire valider marketing) : cf. `NUDGES` dans le fichier.

---

## PR 2 — Mobile iOS (à venir, post-Apple #20)

Écrans, dans l'ordre (`current_step`) :

1. **Bienvenue** (step 0→1) — ancrage valeur : « X poses réservées ce mois sur Blyss », 1 phrase de storytelling. Pas d'offre de bienvenue (contrainte).
2. **Préférences nails** (step 1→2) — 6 choix (`nail_art`, `french`, `couleurs_vives`, `gel`, `resine`, `autre`), sélection unique → `POST /preferences`. Micro-engagement.
3. **Recommandations** (step 2→3) — `GET /recommendations` (passer la ville / position si dispo). 3 cartes : photo, nom, ★ note + avis, badge rareté (`upcoming_14d`), `matches_style` → pastille « pour ton style ». Révélation personnalisée + preuve sociale + rareté.
4. **CTA 1ᵉʳ RDV** (step 3→4) — bouton direct vers la fiche pro / réservation de la 1ᵉʳ reco.
5. **Carousel features** (step 4→5) — 3 slides max, puis `POST /complete`.

Skippable à tout moment (`POST /complete` ou juste sortie) — l'onboarding ne
doit jamais bloquer l'accès à l'app. `GET /status` au lancement pour reprendre
où on en était.

Push : opt-in à l'installation ; les relances passent par le cron backend, le
mobile n'a rien à planifier.

---

## Questions produit ouvertes (à trancher avec le CEO)

1. **Localisation client** — non stockée à l'inscription (seuls les pros ont une
   ville). L'onboarding demande la ville / utilise le GPS ? La route accepte
   `?city=` ; `?lat=&lng=` est réservé mais pas encore implémenté (tri par
   distance). Sans localisation → reco nationale par note/activité.
2. **Taxonomie pro (PR 3)** — pour que « recommandations selon le style » soit
   réel, il faut que les pros déclarent leurs styles (`pro_nail_styles` +
   éditeur). Sinon le style est cosmétique. Go/no-go + qui saisit (pro elle-même
   à l'onboarding pro ? admin ?).
3. **Mesure de la conversion** — pas de pipeline analytics produit. Proposition :
   requête de cohorte SQL `client_onboarding.started_at` vs 1ʳᵉ ligne
   `reservations` du client (D+7 / D+30). Suffisant, ou besoin d'un vrai
   tracking d'événements ?
4. **Rareté** — `upcoming_14d` comme proxy de demande. OK, ou on veut un vrai
   « plus que N créneaux cette semaine » (nécessite d'interroger le moteur de
   dispo par pro — coûteux) ?
5. **Copy des push J+1/J+3/J+7** — valeurs par défaut dans `cron/onboarding-nudge.ts`, à faire relire.
6. **Onboarding obligatoire ou skippable** — proposé : skippable (jamais bloquant).

---

## Dépendances

- Aucun blocage avec #23, #26.
- Migration `20260906000001` : additive, déployable indépendamment.
- Cron inactif tant qu'aucun `client_onboarding` n'existe → PR 1 mergeable et
  déployable sans attendre le mobile.
