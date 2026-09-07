# Réservation web publique (blyssapp.fr) — checklist backend / ops

La page profil pro publique + le tunnel de réservation web sont dans le repo
**Blyss_Website** (Next.js, `github.com/Nozito/Blyss_website`, branche
`feat/public-pro-booking`), servi sur `blyssapp.fr` (Next SSR sur le VPS, derrière
nginx). Ils consomment l'API backend **sans nouvel endpoint** (profil, prestations,
galerie, avis, disponibilités, auth, `/api/reservations`, `/api/payments/create-intent`).

**Le site est autonome côté infra** : tous les appels API + les fichiers
`/uploads/*` sont **reproxifiés en same-origin par des rewrites Next**
(`next.config.ts`) → aucune config CORS ni CORP côté backend n'est requise, ni en
prod ni en local.

Il reste **2 points** avant la prod, + 1 recommandé.

---

## 1. Clé Stripe publishable  ⚠️ requis pour le paiement en ligne

Variable d'env de build du site Next (sur le VPS) :

```
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…   # puis pk_live_… en prod
```

= la clé **publishable plateforme**, la même que `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`
dans `blyss-mobile/eas.json`. **Rien à changer côté backend** :
`POST /api/payments/create-intent` reste une *destination charge*
(`transfer_data.destination` + `automatic_payment_methods`), le site confirme avec
`@stripe/stripe-js` + `PaymentElement` en n'utilisant que le `client_secret`.

Sans cette clé : le tunnel fonctionne quand même pour les pros **sans Stripe**
(`stripe_onboarding_complete=false` → « payer sur place », réservation confirmée
sans paiement).

---

## 2. Empreinte SHA-256 Android → assetlinks.json

`Blyss_website` : `src/app/.well-known/assetlinks.json/route.ts` contient un
placeholder `REMPLACER_PAR_L_EMPREINTE_SHA256_DU_CERTIFICAT_PLAY`. À remplacer par
l'empreinte SHA-256 du certificat de signature Play (Play Console → Intégrité de
l'app → Certificat de clé de signature d'application). Nécessaire pour les App
Links Android ; **pas bloquant** pour tester `/s/[id]` et `/booking/[id]` dans un
navigateur. L'AASA iOS (`apple-app-site-association/route.ts`) est complet.

---

## 3. Sous-domaine `api.blyssapp.fr` (recommandé — pour le mobile prod)

Seul `app.blyssapp.fr` sert l'API aujourd'hui. Le build **mobile production**
(`blyss-mobile/eas.json` → `EXPO_PUBLIC_API_URL`) et `app.config.ts` pointent déjà
vers `https://api.blyssapp.fr`, qui **n'existe pas en DNS** (NXDOMAIN chez OVH) —
à créer **avant toute soumission App Store** :

1. **OVH** — zone `blyssapp.fr` → `A   api   51.75.77.50` (IP du VPS).
2. **nginx** — `server { server_name api.blyssapp.fr; location / { proxy_pass
   http://127.0.0.1:3001; proxy_set_header Host $host; proxy_set_header Upgrade
   $http_upgrade; proxy_set_header Connection "upgrade"; proxy_set_header X-Real-IP
   $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; }
   listen 80; }` puis `certbot --nginx -d api.blyssapp.fr`.

Le site web n'en a pas besoin (il proxifie déjà). Si tu le crées, tu peux poser
`BLYSS_API_URL=https://api.blyssapp.fr` sur le site pour que les rewrites tapent
dessus plutôt que sur `app.blyssapp.fr`.

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

## Note — CORP sur /uploads

Le backend sert `/uploads/*` avec `Cross-Origin-Resource-Policy: same-origin`
(défaut helmet). Le site contourne via un rewrite same-origin. **Fix optionnel plus
propre** si un autre client web doit un jour embarquer ces images :
`helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } })`, ou poser
`res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')` uniquement sur le
`express.static` de `/uploads`.

## Hors périmètre v1 web

Pas de messagerie web (« Contacter la pro » → CTA app), pas d'espace « Mes
réservations » web, onboarding client (#34) porté sans carte ni push.
