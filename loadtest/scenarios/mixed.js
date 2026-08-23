import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

// ─────────────────────────────────────────────────────────────────────────
// Scénario "mix réaliste" — parcours client Blyss
//   60% lecture   : recherche de pros + consultation prestations
//   30% auth      : signup (compte loadtest- jetable) + login
//   10% critique  : recherche de créneau + réservation (payment_method=on_site)
//
// Cible : backend LOCAL (localhost:3001) connecté au vrai Supabase Cloud,
// jamais app.blyssapp.fr. Rate-limiters bypassés via LOADTEST_BYPASS_RATE_LIMIT=true
// côté serveur (voir middleware/rate-limits.ts).
//
// Toutes les données écrites sont préfixées "loadtest-" pour un nettoyage
// garanti après coup (voir loadtest/cleanup.mjs).
// ─────────────────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || "http://localhost:3001";
// PRO_ID=2 (camille@blyss.dev, fixture seed) sert au parcours lecture — pas
// de créneaux dispo dessus (données de seed obsolètes).
const PRO_ID = Number(__ENV.PRO_ID || 2);
const RUN_ID = __ENV.RUN_ID || `${Date.now()}`;

// Pour la réservation : N pros jetables (backend/loadtest-seed-pro.ts <N>),
// manifeste dans loadtest/pros.json. Répartir les bookings sur plusieurs
// pros — pas un seul — évite une contention artificielle sur l'advisory
// lock (scopé par pro_id) qu'aucun trafic réel ne produirait jamais.
const BOOKING_PROS = JSON.parse(open("../pros.json"));

export const options = {
  scenarios: {
    mixed_client_journey: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: Number(__ENV.VUS || 50) },  // montée
        { duration: "2m", target: Number(__ENV.VUS || 50) },   // plateau
        { duration: "20s", target: 0 },                        // descente
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],          // < 1% d'erreurs (objectif backend)
    http_req_duration: ["p(95)<500"],        // p95 < 500ms (objectif backend)
    "http_req_duration{endpoint:search}": ["p(95)<500"],
    "http_req_duration{endpoint:booking}": ["p(95)<500"],
  },
};

const bookingErrorRate = new Rate("booking_error_rate");
const searchLatency = new Trend("search_latency_ms");

function authHeaders(token) {
  return { headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } };
}

function jsonHeaders() {
  return { headers: { "Content-Type": "application/json" } };
}

/** Date ISO à J+21 (>14j pour éviter la case rétractation early_execution_requested) */
function futureDateStr(daysAhead) {
  const d = new Date(Date.now() + daysAhead * 86400 * 1000);
  return d.toISOString().slice(0, 10);
}

// Un seul signup par VU (état module-level, conservé entre itérations d'un
// même VU) — un utilisateur réel s'inscrit une fois, puis se reconnecte/
// navigue. Faire un signup à CHAQUE itération simulait une tempête de
// créations de compte qui n'arrive jamais en usage réel, et masquait le
// vrai bottleneck (bcrypt cost=12 × 50 signups simultanés) derrière un
// scénario qui ne reflète pas la prod.
let vuEmail = null;
let vuPassword = "Loadtest123!";
let vuToken = null;

export default function () {
  if (vuToken === null) {
    const vuTag = `${RUN_ID}-${__VU}`;
    vuEmail = `loadtest-${vuTag}@blyss-loadtest.invalid`;

    const signupRes = http.post(
      `${BASE_URL}/api/auth/signup`,
      JSON.stringify({ email: vuEmail, password: vuPassword, first_name: "Loadtest", last_name: vuTag }),
      { ...jsonHeaders(), tags: { endpoint: "signup" } }
    );
    const signupOk = check(signupRes, { "signup 200": (r) => r.status === 200 });
    if (!signupOk) {
      sleep(1);
      return;
    }
    vuToken = signupRes.json("data.accessToken");
  }

  // ── Login explicite (mesure séparée de l'endpoint le plus sollicité en prod réelle) ─
  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: vuEmail, password: vuPassword }),
    { ...jsonHeaders(), tags: { endpoint: "login" } }
  );
  check(loginRes, { "login 200": (r) => r.status === 200 });
  const token = loginRes.json("data.accessToken") || vuToken;

  sleep(0.3);

  const roll = Math.random();

  if (roll < 0.9) {
    // ── 3a. Parcours lecture (90% des itérations post-auth ≈ 60-70% du trafic total) ─
    const prestaRes = http.get(`${BASE_URL}/api/prestations/pro/${PRO_ID}`, {
      tags: { endpoint: "search" },
    });
    searchLatency.add(prestaRes.timings.duration);
    check(prestaRes, { "prestations 200": (r) => r.status === 200 });

    const searchRes = http.get(`${BASE_URL}/api/client/specialists?search=nail`, {
      ...authHeaders(token),
      tags: { endpoint: "search" },
    });
    check(searchRes, { "specialists 200": (r) => r.status === 200 });
  } else {
    // ── 3b. Parcours critique : créneau + réservation (~10%) ──────────────
    const pro = BOOKING_PROS[Math.floor(Math.random() * BOOKING_PROS.length)];
    const date = futureDateStr(1 + Math.floor(Math.random() * 28)); // J+1 à J+28
    const slotsRes = http.get(`${BASE_URL}/api/slots/available/${pro.proId}/${date}`, {
      tags: { endpoint: "slots" },
    });
    const slots = slotsRes.json("data") || [];
    if (slots.length === 0) {
      bookingErrorRate.add(1);
      sleep(0.5);
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
    const bookingOk = check(bookingRes, { "booking 200": (r) => r.status === 200 });
    bookingErrorRate.add(bookingOk ? 0 : 1);
  }

  sleep(Math.random() * 1.5 + 0.5); // pense-bête utilisateur réel entre actions
}
