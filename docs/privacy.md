# Minimisation des données — périmètre client de la pro

Règle métier appliquée **côté API** (pas seulement dans l'app mobile) : une
professionnelle n'accède qu'aux données de clientes strictement nécessaires à
la relation qu'elle a avec elles.

Introduit par `fix/privacy/pro-client-scope` (blyss-app + blyss-mobile).

## Statuts métier de référence

Une « cliente de la pro » = une utilisatrice `role = 'client'` ayant **au moins
une réservation** avec cette pro dont le `status` est `confirmed` **ou**
`completed`.

Ne comptent **pas** : `pending`, `cancelled`, `no_show`.

## `GET /api/pro/clients/search`

`pro_id` provient **toujours** du token (`getProId(req)`), jamais du client.

### Mode relation (défaut)

Recherche par nom / prénom / email / téléphone (`ILIKE`), `q` ≥ 2 caractères.

Périmètre : uniquement les clientes de la pro (jointure `reservations` sur
`pro_id` + statuts de référence). Une non-cliente ne remonte jamais, même sur
un nom exact. Résultat vide = `[]`, sans indiquer qu'un résultat est masqué.

### Mode contact exact — `?exact=1` (walk-in)

Pour rattacher une cliente **sans historique** avec la pro (prise de RDV au
comptoir / par téléphone).

- Correspondance **stricte** sur `email` (`LOWER(email) = ?`) **ou** téléphone
  (`regexp_replace(phone_number, '[^0-9+]', '', 'g') = ?`, comparaison sans
  séparateurs des deux côtés).
- Aucune recherche par nom, fragment ou approximation.
- La saisie qui ne ressemble ni à un email ni à un téléphone (6–15 chiffres)
  renvoie `[]`.
- Projection minimale : `id, first_name, last_name, profile_photo` — ni l'autre
  coordonnée, ni données de fiche. La pro connaît déjà l'identifiant qu'elle a
  tapé ; on ne lui rend que de quoi confirmer l'identité et créer le RDV.

Helper : `backend/lib/contact-match.ts` (`classifyContact`, `normalizePhone`,
`normalizeEmail`).

## `POST /api/pro/appointments`

Le `client_id` du body est accepté **uniquement si** :

1. il existe une réservation `confirmed` / `completed` entre `pro_id` (token) et
   ce `client_id` ; **ou**
2. le body porte `client_contact` (email ou téléphone) dont la normalisation
   correspond **exactement** à ce `client_id` — vérifié côté serveur, la
   résolution faite par `search` n'est pas prise pour argent comptant.

Sinon : `403 { success: false, message: "Cliente non rattachée à votre compte." }`.

**Non-divulgation** : cliente inexistante, cliente d'une autre pro et contact
incohérent renvoient tous la **même** réponse générique — l'existence d'un
compte n'est jamais révélée.

Schéma : `client_contact: z.string().max(255).optional()` dans
`proAppointmentSchema` (`backend/middleware/validate.ts`).

## Changements de comportement

| Avant | Après |
|-------|-------|
| `search` renvoyait tout l'annuaire clientes | clientes de la pro + résolution de contact exact |
| walk-in trouvable par fragment de nom | email ou téléphone **exact** requis |
| `client_id` d'une autre pro → RDV créé | `403` |
| cliente inconnue → `404 "Cliente introuvable"` | `403 "Cliente non rattachée à votre compte."` |

## Limites connues

- La comparaison téléphone est « sans séparateurs » mais pas E.164 : un `0X…`
  saisi ne matche pas un `+33X…` stocké. Correspondance stricte volontaire.

## Tests

- `backend/__tests__/pro-client-search-authz.test.ts` — isolation entre deux
  pros, non-divulgation, exact vs fragment, jamais de `ILIKE` en mode exact.
- `backend/__tests__/contact-match.test.ts` — classification email / téléphone.
- `backend/__tests__/pro-appointments.test.ts` — relation vs contact vs refus
  générique.

## Avant publication

Tester le parcours walk-in complet (recherche contact exact → sélection →
création de RDV) sur les deux dépôts déployés ensemble.
