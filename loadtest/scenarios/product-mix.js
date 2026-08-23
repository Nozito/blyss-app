import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

// ─────────────────────────────────────────────────────────────────────────
// FAMILLE 2/2 — "Product mix réaliste" : SESSION/TOKEN RÉUTILISÉ après une
// authentification unique par utilisateur virtuel (setup, pas à chaque
// itération) — c'est CE scénario qui doit servir à évaluer le p95 global
// produit (< 500ms), pas auth-burst.js.
//
// Répartition du trafic : HYPOTHÈSES EXPLICITES, pas des faits mesurés —
// aucun accès en lecture aux analytics réelles (PostHog/Sentry) au moment
// de l'écriture de ce script. Paramétrable via env vars ; à remplacer par
// les vrais ratios dès qu'ils sont disponibles (voir
// loadtest/reports/ pour le détail de cette limitation).
//   - PCT_SEARCH   : recherche/liste de pros (lecture)
//   - PCT_PROFILE  : consultation d'un profil/prestations pro (lecture)
//   - PCT_SLOTS    : vérification de disponibilité (lecture)
//   - PCT_BOOKING  : création de réservation (écriture)
// ─────────────────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || "http://localhost:3001";
const RUN_ID = __ENV.RUN_ID || `${Date.now()}`;
const PRO_ID = Number(__ENV.PRO_ID || 2);
const SESSION_POOL_SIZE = Number(__ENV.SESSION_POOL_SIZE || 200);

// HYPOTHÈSES EXPLICITES — voir bandeau ci-dessus.
const PCT_SEARCH = Number(__ENV.PCT_SEARCH || 0.55);
const PCT_PROFILE = Number(__ENV.PCT_PROFILE || 0.20);
const PCT_SLOTS = Number(__ENV.PCT_SLOTS || 0.15);
// Le reste (1 - somme ci-dessus) = réservation.

let BOOKING_PROS = [];
try {
  BOOKING_PROS = JSON.parse(open("../pros.json"));
} catch (e) {
  // pros.json optionnel si PCT_BOOKING effectif = 0 pour ce run.
}

export const options = {
  scenarios: {
    product_mix: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: Number(__ENV.VUS || 50) },
        { duration: "2m", target: Number(__ENV.VUS || 50) },
        { duration: "20s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    // LE seuil qui compte pour le critère de sortie "p95 global < 500ms" —
    // ce scénario ne fait PAS d'auth par itération, donc pas de plancher
    // bcrypt qui pollue cette métrique.
    http_req_duration: ["p(95)<500"],
    "http_req_duration{endpoint:search}": ["p(95)<500"],
    "http_req_duration{endpoint:booking}": ["p(95)<2000"], // seuil métier explicite
    http_req_failed: ["rate<0.01"],
  },
};

const bookingErrorRate = new Rate("booking_error_rate");

function authHeaders(token) {
  return { headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } };
}

function futureDateStr(daysAhead) {
  const d = new Date(Date.now() + daysAhead * 86400 * 1000);
  return d.toISOString().slice(0, 10);
}

/**
 * setup() s'exécute UNE FOIS avant le test (pas par VU, pas par itération) —
 * crée un pool de comptes déjà authentifiés, réutilisés ensuite par toutes
 * les itérations. C'est ce qui distingue ce scénario de auth-burst.js :
 * l'authentification n'est jamais sur le chemin critique mesuré.
 */
export function setup() {
  const tokens = [];
  for (let i = 0; i < SESSION_POOL_SIZE; i++) {
    const email = `loadtest-${RUN_ID}-session-${i}@blyss-loadtest.invalid`;
    const password = "Loadtest123!";
    const res = http.post(
      `${BASE_URL}/api/auth/signup`,
      JSON.stringify({ email, password, first_name: "Loadtest", last_name: `session-${i}` }),
      { headers: { "Content-Type": "application/json" } }
    );
    const token = res.json("data.accessToken");
    if (token) tokens.push(token);
  }
  console.log(`setup() : ${tokens.length}/${SESSION_POOL_SIZE} sessions pré-authentifiées.`);
  return { tokens };
}

export default function (data) {
  const token = data.tokens[Math.floor(Math.random() * data.tokens.length)];
  if (!token) {
    sleep(0.5);
    return;
  }

  const roll = Math.random();

  if (roll < PCT_SEARCH) {
    // ── Recherche / liste de pros ──────────────────────────────────────
    const res = http.get(`${BASE_URL}/api/client/specialists?search=nail`, {
      ...authHeaders(token),
      tags: { endpoint: "search" },
    });
    check(res, { "specialists 200": (r) => r.status === 200 });
  } else if (roll < PCT_SEARCH + PCT_PROFILE) {
    // ── Consultation d'un profil pro (prestations) ─────────────────────
    const res = http.get(`${BASE_URL}/api/prestations/pro/${PRO_ID}`, {
      tags: { endpoint: "search" },
    });
    check(res, { "prestations 200": (r) => r.status === 200 });
  } else if (roll < PCT_SEARCH + PCT_PROFILE + PCT_SLOTS) {
    // ── Vérification de disponibilité ──────────────────────────────────
    const pro = BOOKING_PROS.length > 0 ? BOOKING_PROS[Math.floor(Math.random() * BOOKING_PROS.length)] : { proId: PRO_ID };
    const date = futureDateStr(1 + Math.floor(Math.random() * 28));
    const res = http.get(`${BASE_URL}/api/slots/available/${pro.proId}/${date}`, {
      tags: { endpoint: "slots" },
    });
    check(res, { "slots 200": (r) => r.status === 200 });
  } else {
    // ── Réservation (écriture) ─────────────────────────────────────────
    if (BOOKING_PROS.length === 0) {
      sleep(0.3);
      return;
    }
    const pro = BOOKING_PROS[Math.floor(Math.random() * BOOKING_PROS.length)];
    const date = futureDateStr(1 + Math.floor(Math.random() * 28));
    const slotsRes = http.get(`${BASE_URL}/api/slots/available/${pro.proId}/${date}`, {
      tags: { endpoint: "slots" },
    });
    const slots = slotsRes.json("data") || [];
    if (slots.length === 0) {
      bookingErrorRate.add(1);
      sleep(0.3);
      return;
    }
    const slot = slots[Math.floor(Math.random() * slots.length)];
    const bookingRes = http.post(
      `${BASE_URL}/api/reservations`,
      JSON.stringify({
        pro_id: pro.proId,
        prestation_id: pro.prestationId,
        start_datetime: slot.start_datetime,
        end_datetime: slot.end_datetime,
        slot_id: slot.id,
        payment_method: "on_site",
        early_execution_requested: true,
      }),
      { ...authHeaders(token), tags: { endpoint: "booking" } }
    );
    const ok = check(bookingRes, { "booking 200": (r) => r.status === 200 });
    bookingErrorRate.add(ok ? 0 : 1);
  }

  sleep(Math.random() * 1.5 + 0.5);
}
