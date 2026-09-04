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
| `onboarding_preferences_selected` | écran 2, au tap « Continuer » après choix du style + saisie ville | `{ style_nails, location: { city \| postal_code }, has_location: boolean }` | émis **après** le `200` de `POST /api/client/onboarding/preferences` |
| `onboarding_recommendations_viewed` | écran 3 affiché avec la réponse de `GET …/recommendations` | `{ style_nails, style_filter_active, results_count, pro_ids: number[], had_scarcity: boolean }` | `had_scarcity` = au moins une pro avec `open_slots.this_week > 0` |
| `onboarding_cta_tapped` | écran 4, tap « Prendre RDV » (ou tap sur une carte pro à l'écran 3) | `{ pro_id, position: 1\|2\|3, from: "reco_card" \| "cta_screen" }` | double d'un `POST /api/client/onboarding/cta` (compteur serveur pour l'admin) |
| `onboarding_completed` | écran 5, fin du carousel → `POST …/complete` `200` | `{ steps_seen: number, duration_seconds: number }` | |
| `onboarding_skipped` | tap « Plus tard » sur n'importe quel écran → `POST …/skip` `200` | `{ at_step: 1..5, screen: string }` | l'onboarding reste reprenable depuis les paramètres |
| `onboarding_resumed` | reprise depuis Paramètres → écran 1/2 | `{ from_step: number }` | optionnel |
| `first_appointment_booked` | 1ᵉʳ RDV nails confirmé du client (réservation créée) | `{ pro_id, from_onboarding: boolean, days_since_signup: number, style_match: boolean }` | `from_onboarding` = la réservation vient d'une carte reco / du CTA onboarding (garder l'origine en mémoire jusqu'à la résa) |

## Funnel cible (PostHog)

```
onboarding_started
  → onboarding_preferences_selected      (biais : micro-engagement)
  → onboarding_recommendations_viewed     (biais : preuve sociale + rareté + perso)
  → onboarding_cta_tapped
  → first_appointment_booked              ← KPI principal (#34)
```

`onboarding_completed` est secondaire (le carousel features n'est pas sur le
chemin critique de la conversion).

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
