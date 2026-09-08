# Minimisation des données — périmètre client de la pro

Règle métier appliquée **côté API** (pas seulement dans l'app mobile) : une
professionnelle n'accède qu'aux données de clientes strictement nécessaires à
la relation qu'elle a **déjà** avec elles.

## Décision produit

Une pro ne peut créer un rendez-vous **que pour une cliente existante avec qui
elle a déjà une relation**. Il n'existe **pas** de flux « nouvelle cliente » /
« walk-in » / saisie d'un contact exact.

(Historique : une option B « walk-in par contact exact » avait été livrée puis
**retirée** — voir `fix/pro-appointments-existing-clients-only`.)

## Statut métier de référence

« Cliente de la pro » = une utilisatrice `role = 'client'` ayant **au moins une
réservation** avec cette pro dont le `status` est `confirmed` **ou**
`completed`.

Ne comptent **pas** : `pending`, `cancelled`, `no_show`.

## `GET /api/pro/clients/search`

- `pro_id` provient **toujours** du token (`getProId(req)`), jamais du client.
- Recherche par nom / prénom / email / téléphone (`ILIKE`), `q` ≥ 2 caractères.
- Périmètre : **uniquement** les clientes de la pro (jointure `reservations`
  sur `pro_id` + statuts de référence).
- Une non-cliente ne remonte **jamais**, même sur un nom ou un email exact.
- Résultat vide = `[]`, sans indiquer qu'un résultat est masqué.
- Le paramètre `?exact=1` n'a plus d'effet particulier (pas de résolution par
  email/téléphone exact).

## `POST /api/pro/appointments`

Le `client_id` du body est accepté **uniquement si** il existe une réservation
`confirmed` / `completed` entre `pro_id` (token) et ce `client_id`.

Sinon : `403 { success: false, message: "Cliente non rattachée à votre compte." }`.

**Non-divulgation** : `client_id` inexistant, non lié, ou d'une autre pro
renvoient tous la **même** réponse générique — l'existence d'un compte n'est
jamais révélée. Le champ `client_contact` n'existe plus (retiré du schéma et
du handler).

## Chemins de données à surveiller (côté mobile)

Le sheet « Nouveau rendez-vous » ne doit lister des clientes **que** via
`GET /api/pro/clients/search`. Aucune liste ne doit provenir de :
`GET /api/pro/clients` (fiche/annuaire relationnel, autre usage),
`GET /api/pro/reservations/search`, d'un cache local, ni de données
pré-chargées.

## Changements de comportement

| Avant | Après |
|-------|-------|
| sous-mode mobile « Nouvelle cliente » (email/téléphone exact) | **supprimé** — recherche « Parmi mes clientes » uniquement |
| `POST` acceptait `client_contact` comme preuve de connaissance | champ retiré ; seule la relation confirmed/completed autorise |
| `?exact=1` résolvait une cliente hors périmètre | sans effet |

## Tests

- `backend/__tests__/pro-client-search-authz.test.ts` — isolation Pro A / Pro B
  (Pro A ne voit jamais une cliente liée uniquement à Pro B), non-divulgation,
  `?exact=1` sans effet, aucun lookup `users` direct par email/téléphone.
- `backend/__tests__/pro-appointments.test.ts` — relation existante → OK ;
  inconnue / autre pro / non liée / `client_contact` fourni → `403` générique ;
  appel direct à l'API sans passer par la recherche → même contrôle.

## Validation manuelle requise avant release

1. Pro A et Pro B, une cliente liée **uniquement** à Pro B.
2. Recherche « Nadia » depuis le compte Pro A → **aucun résultat**.
3. Inspecter l'onglet réseau : seul `GET /api/pro/clients/search` est appelé,
   sur la bonne base API. Confirmer le commit backend déployé.
4. Recherche « Nadia » depuis Pro B → sa cliente apparaît.
5. `POST /api/pro/appointments` (curl / proxy) avec le `client_id` de la
   cliente de B, authentifié en A → `403 "Cliente non rattachée à votre compte."`.

## Limites connues

Aucune (le mode contact exact et sa comparaison téléphone non-E.164 ont été
retirés).
