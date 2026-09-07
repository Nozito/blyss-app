# Réservation web publique (blyssapp.fr) — checklist backend / ops

La page profil pro publique + le tunnel de réservation web sont développés dans le
repo **Blyss-web** (branche `feat/public-pro-booking`), servis sur `blyssapp.fr`.
Ils consomment l'API backend **sans nouvel endpoint** : profil/prestations/galerie/
avis/disponibilités (routes publiques existantes), et auth + `/api/reservations` +
`/api/payments/create-intent` (routes authentifiées existantes).

Rien à coder côté backend. En revanche 4 points d'infra bloquent la mise en prod.

---

## 1. CORS — ajouter blyssapp.fr aux origines autorisées  ⚠️ BLOQUANT

`backend/server.ts` (~l.175) : `allowedOrigins` vient de la variable d'env
`CORS_ORIGINS` (fallback = `localhost:5173` + `localhost:8080` uniquement).
Toute requête `fetch` depuis le navigateur web sera rejetée tant que ce n'est pas fait.

Ajouter à `CORS_ORIGINS` (liste séparée par des virgules) :

```
https://blyssapp.fr,https://www.blyssapp.fr
```

- **Prod** : VPS Ubuntu/nginx (backend derrière `app.blyssapp.fr` / `api.blyssapp.fr`) —
  éditer le `.env` du service puis redéployer/restart (cf.
  `memory/reference_railway_backend_deploy` : redeploy manuel en SSH).
- **Staging** : service Railway `blyss-staging-backend` → variables d'env.
- **Dev** : pour tester Blyss-web en local contre le backend staging, ajouter aussi
  `http://localhost:5173`.

`credentials: true` est déjà positionné côté CORS ; le web envoie surtout un header
`Authorization: Bearer`, mais garde `credentials` pour le refresh cookie.

---

## 2. Fichiers .well-known sur blyssapp.fr

Livrés dans Blyss-web (`public/.well-known/`, servis par `vercel.json`) :

- `apple-app-site-association` — `appIDs: ["B92ST2GG54.blyss.app"]`, chemins `/s/*`
  et `/booking/*`. Servi en `application/json`, **sans redirection** (Apple refuse
  un AASA obtenu via 301/302).
- `assetlinks.json` — **contient un placeholder** :
  `REMPLACER_PAR_L_EMPREINTE_SHA256_DU_CERTIFICAT_DE_SIGNATURE_PLAY`.

### Action ops

- Après déploiement, vérifier :
  ```
  curl -sI https://blyssapp.fr/.well-known/apple-app-site-association
  # → 200, content-type: application/json, pas de header location
  ```
- Fournir l'**empreinte SHA-256** du certificat de signature Android (Play App
  Signing → Play Console → Configuration → Intégrité de l'app → "Certificat de clé
  de signature d'application", champ SHA-256) et l'insérer dans `assetlinks.json`.

---

## 3. Clé Stripe publishable côté Blyss-web

- Ajouter la variable d'env Vercel du projet Blyss-web :
  `VITE_STRIPE_PUBLISHABLE_KEY` = clé **publishable plateforme** (la même que
  `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` dans `blyss-mobile/eas.json`) — `pk_test_…`
  en preview, `pk_live_…` en prod.
- Backend : **rien à changer**. `POST /api/payments/create-intent` crée une
  *destination charge* (`transfer_data.destination` + `on_behalf_of`,
  `automatic_payment_methods`). Le web confirme avec `@stripe/stripe-js` +
  `PaymentElement` en utilisant juste `client_secret` — pas besoin de contexte
  compte connecté dans Stripe.js.
- Le `PaymentIntent` est rattaché au `stripe_customer_id` de la cliente (créé à la
  volée par le endpoint si absent) — fonctionne pour un compte créé depuis le web.

---

## 4. Config deep-link mobile (blyss-mobile/app.config.ts)

**Aucun changement nécessaire** une fois les `.well-known` servis sur `blyssapp.fr` :

- `associatedDomains: ["applinks:blyssapp.fr"]` et les `intentFilters`
  (host `blyssapp.fr`, pathPrefix `/s` et `/booking`) deviennent valides.
- **NE PAS** basculer sur `app.blyssapp.fr` : les liens de partage
  (`public-profile.tsx` → `https://blyssapp.fr/s/<id>`) et les nouvelles pages web
  vivent sur `blyssapp.fr`.
- Un nouveau build natif iOS/Android sera nécessaire pour que la vérification
  App Links / Universal Links se rejoue (le CDN Apple se rafraîchit seul, mais
  `autoVerify` Android est évalué à l'installation).

---

## Rappel produit

Le endpoint `GET /api/users/pros/:proId` filtre déjà sur
`role='pro' AND pro_status='active' AND profile_visibility='public' AND is_active`.
Une pro privée/inactive → 404 → la page web affiche « Profil indisponible » (géré).
Aucune donnée d'adresse exacte n'est exposée si `geo_precision != 'address'`
(whitelist déjà en place dans le endpoint).

## Ce que le web NE fait PAS (v1)

- Pas de messagerie web (« Contacter la pro » → CTA vers l'app).
- Pas d'espace « Mes réservations » web (gestion/annulation → app).
- Onboarding client (#34) porté sur le web sans carte ni push : l'étape
  « notifications » renvoie vers le téléchargement de l'app.
