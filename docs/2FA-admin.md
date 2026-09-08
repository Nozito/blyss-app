# 2FA TOTP admin — enrôlement, obligation, récupération

Statut : socle TOTP en place depuis `20260823000002`. Obligation progressive via
le flag `ADMIN_2FA_REQUIRED` (issue #21).

---

## 1. Vue d'ensemble

| Élément | Détail |
|---|---|
| Algo | TOTP (RFC 6238), 6 chiffres, fenêtre ±30 s |
| Secret | chiffré AES-256-GCM (`TOTP_ENC_KEY`, 32 octets), jamais en clair — `backend/lib/totp.ts` |
| Codes de secours | 8 codes `XXXXXX-XXXXXX`, hashés bcrypt, **usage unique** (retirés après consommation) |
| Portée | comptes `is_admin = TRUE` uniquement |
| Session MFA | après vérification du 2ᵉ facteur, le token d'accès porte `amr: ["mfa"]` ; le refresh token porte `mfa = true` et propage le claim à chaque rotation (15 min) |

## 2. Enrôlement d'un admin

Tout se fait avec une session admin déjà ouverte (l'admin gère uniquement sa
propre 2FA).

1. **`POST /api/admin/2fa/setup`**
   → réponse : `{ qr_code: "data:image/png;base64,…", secret: "BASE32" }`
   Le secret est stocké chiffré mais `totp_enabled` reste `FALSE`.
   Scanner le QR code dans une app d'authentification (Google Authenticator,
   1Password, Aegis, Raivo…).

2. **`POST /api/admin/2fa/confirm`** avec `{ "token": "123456" }` (code affiché
   par l'app)
   → réponse : `{ backup_codes: ["A1B2C3-D4E5F6", …] }` (8 codes)
   `totp_enabled` passe à `TRUE`. **Les codes de secours ne sont affichés
   qu'une fois** — les stocker dans un gestionnaire de mots de passe.

3. À la prochaine connexion : après e-mail + mot de passe, l'API répond
   `{ requires_2fa: true, challenge_token }` au lieu de poser les cookies.
   Envoyer **`POST /api/auth/2fa/verify`** avec `{ challenge_token, code }` où
   `code` = code TOTP à 6 chiffres **ou** un code de secours.

## 3. Désactivation

**`POST /api/admin/2fa/disable`** avec `{ "token": "123456" }` (code TOTP
valide obligatoire). Efface le secret et les codes de secours.

> Quand `ADMIN_2FA_REQUIRED = true`, se désactiver reste possible (le code TOTP
> est exigé) mais l'admin sera immédiatement re-bloqué au prochain appel
> `/api/admin/*` tant qu'il n'a pas re-enrôlé. À n'utiliser que pour changer
> d'appareil.

## 4. Récupération

| Situation | Procédure |
|---|---|
| Téléphone perdu, **codes de secours dispo** | se connecter avec un code de secours via `/api/auth/2fa/verify`, puis `POST /api/admin/2fa/disable` (il faut un code TOTP → d'abord restaurer l'app depuis une sauvegarde, sinon voir ligne suivante) → en pratique : demander à un autre admin le reset ci-dessous |
| Téléphone perdu **et** plus de codes de secours | **un autre admin** exécute le reset : `UPDATE users SET totp_enabled = FALSE, totp_secret_encrypted = NULL, totp_secret_iv = NULL, totp_backup_codes = '[]' WHERE id = <id_admin>;` (SQL Editor Supabase ou script ops). L'admin ré-enrôle ensuite (§2). Tracer l'action. |
| Plus **aucun** admin ne peut se connecter | reset SQL du même type sur un compte admin, ou repasser `ADMIN_2FA_REQUIRED = false` le temps de rétablir l'accès |
| `TOTP_ENC_KEY` perdue | tous les secrets sont indéchiffrables → reset SQL de **tous** les admins (`totp_enabled = FALSE`, secrets `NULL`) + ré-enrôlement général |

Il doit toujours rester **au moins un admin** capable de se connecter (avec app
TOTP fonctionnelle ou codes de secours). Ne jamais activer `ADMIN_2FA_REQUIRED`
en prod avant que **tous** les admins actifs soient enrôlés et aient testé leur
connexion.

## 5. Le flag `ADMIN_2FA_REQUIRED`

Variable d'environnement backend. Lue à chaque requête (pas de redémarrage
nécessaire si le process la relit — sinon redéployer).

| Valeur | Effet sur `/api/admin/*` |
|---|---|
| absent / `"false"` | 2FA **optionnelle** — un admin sans TOTP passe (comportement historique) |
| `"true"` | pour toute route sauf `/2fa/setup` et `/2fa/confirm` : `totp_enabled = FALSE` → **403** `2fa_enrollment_required` ; token sans `amr:["mfa"]` → **401** `mfa_required` |

Les routes d'enrôlement (`/api/admin/2fa/setup`, `/api/admin/2fa/confirm`)
restent toujours accessibles à un admin authentifié, pour permettre la bascule.
Le front admin doit intercepter `2fa_enrollment_required` → écran d'enrôlement,
et `mfa_required` → renvoi vers le login.

## 6. Rollout recommandé

1. **Staging** : déployer le code, `ADMIN_2FA_REQUIRED = true`, créer un compte
   admin de test (`is_admin = TRUE`, `totp_enabled = FALSE`), puis lancer la
   validation automatisée :
   ```bash
   API_URL=https://<staging> \
   ADMIN_EMAIL=admin-test@blyssapp.fr ADMIN_PASSWORD='…' \
   node backend/scripts/validate-2fa-staging.mjs
   ```
   Le script enchaîne blocage sans TOTP → enrôlement → login TOTP → `amr:["mfa"]`
   → rotation refresh → code de secours + non-réutilisation, et sort en code 0
   si tout est vert. Vérifier ensuite **à la main** la bascule du flag
   (`false` → admin sans TOTP passe ; `true` → bloqué).

   > Faute d'environnement staging déployé, la logique est déjà couverte par
   > `backend/__tests__/admin-2fa.test.ts` + `totp-e2e.test.ts` (app Express
   > réelle, otplib/AES/bcrypt réels) et le job **E2E Playwright** (Postgres 16
   > réel — applique la migration `20260905000001`). Le script ci-dessus reste
   > à passer contre une instance déployée avant l'activation prod.

2. **Prod** : déployer avec `ADMIN_2FA_REQUIRED = false`.
3. **Communication aux admins** (avant activation) :
   - « La 2FA devient obligatoire le <date>. »
   - lien vers cette procédure (§2), rappel de stocker les codes de secours,
   - qui contacter en cas de souci (autre admin pour le reset).
4. Laisser une **période d'enrôlement** (≥ 1 semaine). Vérifier en base :
   `SELECT email FROM users WHERE is_admin AND NOT totp_enabled;` → doit être vide.
5. **Activer** `ADMIN_2FA_REQUIRED = true` en prod (redéploiement / mise à jour
   de la variable). Surveiller les 401/403 admin les heures suivantes.
6. Rollback immédiat possible : repasser la variable à `false`.
