# Onboarding client — tracking PostHog (#34)

Événements envoyés **depuis le mobile** (blyss-mobile). Doublés d'une mesure de
cohorte SQL côté backend (voir §Cohorte).

Convention : `snake_case`, préfixe `onboarding_` pour le parcours. `distinct_id`
= `client_id` (utilisateur authentifié après inscription).

---

## Événements

| Événement | Quand | Payload | Notes |
|---|---|---|---|
| `onboarding_started` | écran 1 « Bienvenue » affiché, juste après l'inscription | `{ source: "signup" }` | 1 seul par client (garder un flag local pour ne pas ré-émettre à chaque relance) |
| `onboarding_preferences_selected` | écran 3, au tap « Continuer » après choix style + prestation(s) + ville | `{ style_nails, services: string[], services_count, location, has_location }` | émis **après** le `200` de `POST …/preferences` — `services` = axe prestation (passe 3b) |
| `onboarding_recommendations_viewed` | écran 4 affiché avec la réponse de `GET …/recommendations` | `{ style_nails, style_filter_active, results_count, empty, pro_ids: number[], had_scarcity }` | `empty` → route vers l'écran notifications |
| `onboarding_pro_followed` | tap `♥` sur une ligne reco (écran 4) | `{ pro_id, position: 1\|2\|3 }` | double d'un `POST …/follow` (compteur `pros_followed` pour l'admin) |
| `onboarding_cta_tapped` | écran 5, tap « Réserver » (ou tap sur une ligne pro à l'écran 4) | `{ pro_id, position, from: "reco_card" \| "cta_screen" }` | double d'un `POST …/cta` |
| `onboarding_notif_prompted` | écran 6 (pré-permission notifs) affiché | `{ from: "onboarding" \| "empty_state" }` | avant la pop-up iOS système |
| `onboarding_notif_result` | après la pop-up (ou « plus tard ») | `{ result: "granted" \| "denied" \| "later" \| "error" }` | |
| `onboarding_attribution` | écran 7, tap d'une source | `{ source: "instagram" \| "tiktok" \| "amie" \| "prothesiste" \| "google" \| "pub" }` | double d'un `POST …/attribution` → `client_onboarding.acquisition_source` |
| `onboarding_completed` | écran 7 (Terminer / Passer) → `POST …/complete` `200` | `{ steps_seen: 7 }` | |
| `onboarding_skipped` | tap « Plus tard » sur n'importe quel écran → `POST …/skip` `200` | `{ at_step: 1..7 }` | l'onboarding reste reprenable depuis les paramètres |
| `onboarding_resumed` | reprise depuis Paramètres → écran 1/2 | `{ from_step: number }` | optionnel |
| `first_appointment_booked` | 1ᵉʳ RDV nails confirmé du client (réservation créée) | `{ pro_id, from_onboarding: boolean, days_since_signup: number, style_match: boolean }` | `from_onboarding` = la réservation vient d'une carte reco / du CTA onboarding (garder l'origine en mémoire jusqu'à la résa) |

## Funnel cible (PostHog)

```
onboarding_started
  → onboarding_preferences_selected      (biais : micro-engagement + effet IKEA)
  → onboarding_recommendations_viewed     (biais : preuve sociale + rareté + perso)
  → onboarding_cta_tapped
  → first_appointment_booked              ← KPI principal (#34)
```

Secondaires : `onboarding_pro_followed` (engagement sans résa),
`onboarding_notif_result = granted` (rétention), `onboarding_attribution`
(mesure d'acquisition), `onboarding_completed`.

> **Passe 3b (2026-09-06)** : parcours réordonné, carousel dissous en écran
> « comment ça marche » (écran 2). Ordre : 1 Bienvenue · 2 Comment ça marche ·
> 3 Préférences (style + `services[]` + ville) · 4 Recos + ♥ · 5 CTA ·
> 6 Notifications · 7 « Comment tu as connu Blyss ». Backend : migration
> `20260909000001` (+ `client_preferences.services`, `client_onboarding.acquisition_source`
> / `pros_followed`, table `client_followed_pros`, `current_step` 0..7).

## Propriétés communes (super properties, à setter une fois)

`app_version`, `platform: "ios"`, `signup_date`.

## Cohorte SQL (backend, complément)

Sans dépendre de PostHog, mesure de référence :

```sql
-- Taux de conversion inscription → 1ᵉʳ RDV nails, par semaine d'inscription,
-- fenêtres D+7 et D+30.
SELECT
  date_trunc('week', o.started_at)                                   AS cohort_week,
  count(*)                                                           AS onboarded,
  count(*) FILTER (WHERE r.first_at <= o.started_at + INTERVAL '7 days')  AS booked_d7,
  count(*) FILTER (WHERE r.first_at <= o.started_at + INTERVAL '30 days') AS booked_d30
FROM client_onboarding o
LEFT JOIN LATERAL (
  SELECT min(created_at) AS first_at FROM reservations WHERE client_id = o.client_id
) r ON true
GROUP BY 1 ORDER BY 1;
```

Comparer avec le taux des inscrits **hors** onboarding (avant le déploiement, ou
si un bucket A/B est mis en place).
