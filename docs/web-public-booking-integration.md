# Réservation web publique (blyssapp.fr) — checklist backend / ops

La page profil pro publique + le tunnel de réservation web sont dans le repo
**Blyss_Website** (Next.js, `github.com/Nozito/Blyss_website`, branche
`feat/public-pro-booking`), servi sur `blyssapp.fr` (Next SSR sur le VPS, derrière
nginx). Ils consomment l'API backend **sans nouvel endpoint** :

- lecture (profil / prestations / galerie / avis / disponibilités) — routes
  publiques existantes, appelées **côté serveur** par la page `/s/[id]` (pas de
  CORS pour cette page) ;
- auth + `/api/reservations` + `/api/payments/create-intent` — routes
  authentifiées existantes, appelées **côté client** dans le tunnel `/booking/[id]`
  (CORS requis).

Rien à coder côté backend. 3 points d'infra bloquent la mise en prod.

---

## 1. CORS — autoriser blyssapp.fr  ⚠️ BLOQUANT (pour le tunnel de résa)

`backend/server.ts` (~l.175) : `allowedOrigins` vient de `CORS_ORIGINS` dans
**`backend/.env.prod`** (chargé car `NODE_ENV=production`, cf. server.ts:110-116).
Fallback = `localhost` uniquement.

Sur le VPS :

```bash
cd <dossier backend>              # celui qui contient dist/server.js ET .env.prod
cp .env.prod .env.prod.bak
grep CORS_ORIGINS .env.prod       # valeur actuelle (ex. https://app.blyssapp.fr)
nano .env.prod
#   CORS_ORIGINS=https://app.blyssapp.fr,https://blyssapp.fr,https://www.blyssapp.fr
#   (pas d'espace, pas de slash final)
pm2 restart <nom>                 # ou systemctl restart / docker compose restart
```

Vérif (cible `app.blyssapp.fr` — `api.blyssapp.fr` n'existe pas encore en DNS) :

```bash
curl -sS -D - -o /dev/null -H "Origin: https://blyssapp.fr" \
  https://app.blyssapp.fr/api/users/pros/8 | grep -i access-control-allow-origin
# → access-control-allow-origin: https://blyssapp.fr
```

Faire pareil sur le **staging** (Railway `blyss-staging-backend` → Variables) +
`http://localhost:3000` pour le dev Next.

---

## 2. Sous-domaine `api.blyssapp.fr` (recommandé — débloque aussi le mobile prod)

Actuellement seul `app.blyssapp.fr` sert l'API. Le build **mobile production**
(`blyss-mobile/eas.json` → `EXPO_PUBLIC_API_URL`) et `app.config.ts` pointent
déjà vers `https://api.blyssapp.fr`, qui **n'existe pas en DNS** (NXDOMAIN chez OVH).

Le site web utilise `NEXT_PUBLIC_BLYSS_API_URL` (défaut `https://app.blyssapp.fr`)
→ il marche sans ce sous-domaine, mais autant le créer maintenant :

1. **OVH** — zone `blyssapp.fr` → `A   api   51.75.77.50` (IP du VPS).
2. **nginx** — bloc `server { server_name api.blyssapp.fr; location / { proxy_pass
   http://127.0.0.1:3001; proxy_set_header Host $host; proxy_set_header Upgrade
   $http_upgrade; proxy_set_header Connection "upgrade"; ... } listen 80; }` puis
   `certbot --nginx -d api.blyssapp.fr`.
3. Basculer `NEXT_PUBLIC_BLYSS_API_URL=https://api.blyssapp.fr` côté site.

---

## 3. Clé Stripe publishable + fichier assetlinks Android

- **`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`** dans l'environnement de build du site
  (`.env` / config de déploiement Next sur le VPS) = clé **publishable plateforme**
  (la même que `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` dans `blyss-mobile/eas.json`) :
  `pk_test_…` pour tester, `pk_live_…` en prod. **Rien à changer côté backend** :
  `POST /api/payments/create-intent` reste une *destination charge*
  (`transfer_data.destination` + `automatic_payment_methods`), le site confirme
  avec `@stripe/stripe-js` + `PaymentElement` en n'utilisant que le `client_secret`.

- **`src/app/.well-known/assetlinks.json/route.ts`** contient un placeholder
  `REMPLACER_PAR_L_EMPREINTE_SHA256_DU_CERTIFICAT_PLAY` — à remplacer par
  l'empreinte SHA-256 du certificat de signature Play (Play Console → Intégrité de
  l'app → Certificat de clé de signature d'application). Nécessaire pour les App
  Links Android ; pas bloquant pour tester `/s/[id]` et `/booking/[id]` dans un
  navigateur. L'AASA iOS (`apple-app-site-association/route.ts`) est complet.

---

## Config mobile (`blyss-mobile/app.config.ts`)

**Aucun changement** : `associatedDomains: ["applinks:blyssapp.fr"]` +
`intentFilters` host `blyssapp.fr` deviennent valides dès que le site déploie les
route handlers `.well-known` (servis en `application/json`, sans redirection). Un
nouveau build natif iOS/Android sera nécessaire pour que la vérification se rejoue.

## Rappel produit

`GET /api/users/pros/:proId` filtre déjà sur `profile_visibility='public'` +
`pro_status='active'` + `is_active` → une pro privée renvoie 404, la page web
affiche « Profil indisponible » (géré). L'adresse exacte n'est jamais exposée si
`geo_precision != 'address'` (whitelist déjà en place dans le endpoint).

## Hors périmètre v1 web

Pas de messagerie web (« Contacter la pro » → CTA app), pas d'espace « Mes
réservations » web, onboarding client (#34) porté sans carte ni push (l'étape
notifications renvoie vers le téléchargement de l'app).
