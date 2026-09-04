#!/usr/bin/env node
/**
 * Validation bout-en-bout de la 2FA admin obligatoire (#21) contre un backend
 * DÉPLOYÉ (staging). Pilote uniquement l'API HTTP — ne touche pas la DB.
 *
 * Pré-requis sur la cible :
 *   - ADMIN_2FA_REQUIRED=true
 *   - un compte admin de test : is_admin=TRUE, totp_enabled=FALSE, sans secret
 *     (cf. docs/2FA-admin.md — à créer en SQL, une fois par exécution : le
 *      script enrôle la 2FA et ne sait pas la remettre à zéro)
 *
 * Usage :
 *   API_URL=https://staging.blyssapp.fr \
 *   ADMIN_EMAIL=admin-test@blyssapp.fr ADMIN_PASSWORD='...' \
 *   node backend/scripts/validate-2fa-staging.mjs
 *
 * Sortie : rapport OK/KO par scénario, code 0 si tout est vert.
 */
import { generate as totpGenerate } from "otplib";

const API_URL = (process.env.API_URL || "").replace(/\/$/, "");
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;

if (!API_URL || !EMAIL || !PASSWORD) {
  console.error("API_URL, ADMIN_EMAIL et ADMIN_PASSWORD sont requis.");
  process.exit(2);
}

const results = [];
function record(step, ok, detail = "") {
  results.push({ step, ok, detail });
  console.log(`${ok ? "✅ OK " : "❌ KO "} — ${step}${detail ? `  (${detail})` : ""}`);
}
function decodeJwt(t) {
  return JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString());
}
async function api(path, { method = "GET", body, token } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* noop */ }
  return { status: res.status, json };
}

async function main() {
  console.log(`Cible : ${API_URL}  ·  admin : ${EMAIL}\n`);

  // ── Étape 3 — sans TOTP : login OK mais /api/admin/* bloqué ───────────────
  let r = await api("/api/auth/login", { method: "POST", body: { email: EMAIL, password: PASSWORD } });
  const bootToken = r.json?.data?.accessToken;
  record("3.1 login (mdp) sans TOTP → tokens émis", r.status === 200 && !!bootToken && !r.json?.data?.requires_2fa,
    `status=${r.status}`);

  r = await api("/api/admin/users", { token: bootToken });
  record("3.2 GET /api/admin/users sans TOTP → 403 2fa_enrollment_required",
    r.status === 403 && r.json?.error === "2fa_enrollment_required", `status=${r.status} error=${r.json?.error}`);

  // ── Étape 4 — enrôlement ─────────────────────────────────────────────────
  r = await api("/api/admin/2fa/setup", { method: "POST", token: bootToken });
  const secret = r.json?.data?.secret;
  record("4.1 POST /2fa/setup → 200 + secret + QR",
    r.status === 200 && !!secret && /^data:image\/png;base64,/.test(r.json?.data?.qr_code || ""), `status=${r.status}`);
  if (!secret) return finish();

  r = await api("/api/admin/2fa/confirm", { method: "POST", token: bootToken, body: { token: await totpGenerate({ secret }) } });
  const backupCodes = r.json?.data?.backup_codes || [];
  record("4.2 POST /2fa/confirm (code valide) → 200 + 8 codes de secours",
    r.status === 200 && backupCodes.length === 8, `status=${r.status} backup=${backupCodes.length}`);

  r = await api("/api/admin/2fa/confirm", { method: "POST", token: bootToken, body: { token: "000000" } });
  record("4.3 POST /2fa/confirm après activation (code faux) → 4xx",
    r.status >= 400, `status=${r.status}`);

  // ── Étape 5 — login avec TOTP ────────────────────────────────────────────
  r = await api("/api/auth/login", { method: "POST", body: { email: EMAIL, password: PASSWORD } });
  const challenge = r.json?.data?.challenge_token;
  record("5.1 login → requires_2fa + challenge_token",
    r.status === 200 && r.json?.data?.requires_2fa === true && !!challenge, `status=${r.status}`);

  r = await api("/api/auth/2fa/verify", { method: "POST", body: { challenge_token: challenge, code: await totpGenerate({ secret }) } });
  const mfaToken = r.json?.data?.accessToken;
  const amr = mfaToken ? decodeJwt(mfaToken).amr : null;
  record("5.2 POST /2fa/verify (TOTP) → 200, accessToken amr:['mfa']",
    r.status === 200 && Array.isArray(amr) && amr.includes("mfa"), `status=${r.status} amr=${JSON.stringify(amr)}`);

  r = await api("/api/admin/users", { token: mfaToken });
  record("5.3 GET /api/admin/users avec token MFA → 200",
    r.status === 200, `status=${r.status}`);

  // 5.4 — le marqueur MFA doit survivre à la rotation du refresh token.
  // (clients cookie : le refresh est en cookie ; ici l'API le renvoie aussi
  //  dans le corps pour les clients legacy — on s'en sert pour le test.)
  r = await api("/api/auth/login", { method: "POST", body: { email: EMAIL, password: PASSWORD } });
  r = await api("/api/auth/2fa/verify", {
    method: "POST",
    body: { challenge_token: r.json?.data?.challenge_token, code: await totpGenerate({ secret }) },
  });
  const refreshTok = r.json?.data?.refreshToken;
  r = await api("/api/auth/refresh", { method: "POST", body: { refreshToken: refreshTok } });
  const refreshedAmr = r.json?.data?.accessToken ? decodeJwt(r.json.data.accessToken).amr : null;
  record("5.4 POST /refresh → le nouveau accessToken conserve amr:['mfa']",
    r.status === 200 && Array.isArray(refreshedAmr) && refreshedAmr.includes("mfa"),
    `status=${r.status} amr=${JSON.stringify(refreshedAmr)}`);

  // ── Étape 6 — codes de secours ──────────────────────────────────────────
  r = await api("/api/auth/login", { method: "POST", body: { email: EMAIL, password: PASSWORD } });
  const ch2 = r.json?.data?.challenge_token;
  r = await api("/api/auth/2fa/verify", { method: "POST", body: { challenge_token: ch2, code: backupCodes[0] } });
  const bkAmr = r.json?.data?.accessToken ? decodeJwt(r.json.data.accessToken).amr : null;
  record("6.1 /2fa/verify avec un code de secours → 200, amr:['mfa']",
    r.status === 200 && Array.isArray(bkAmr) && bkAmr.includes("mfa"), `status=${r.status}`);

  r = await api("/api/auth/login", { method: "POST", body: { email: EMAIL, password: PASSWORD } });
  const ch3 = r.json?.data?.challenge_token;
  r = await api("/api/auth/2fa/verify", { method: "POST", body: { challenge_token: ch3, code: backupCodes[0] } });
  record("6.2 réutilisation du même code de secours → 401",
    r.status === 401, `status=${r.status}`);

  finish();
}

function finish() {
  const ko = results.filter((x) => !x.ok);
  console.log(`\n${results.length - ko.length}/${results.length} scénarios OK.`);
  if (ko.length) {
    console.log("KO :");
    ko.forEach((x) => console.log(`  - ${x.step}  ${x.detail}`));
  }
  console.log(
    "\nÀ vérifier manuellement (bascule du flag, hors script) :\n" +
    "  • ADMIN_2FA_REQUIRED=false → un admin sans TOTP accède à /api/admin/* (pas de 403)\n" +
    "  • ADMIN_2FA_REQUIRED=true  → ce même admin est de nouveau bloqué (403)\n" +
    "  • un admin AVEC TOTP + token MFA fonctionne dans les deux cas"
  );
  process.exit(ko.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
