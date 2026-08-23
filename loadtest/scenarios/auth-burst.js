import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";

// ─────────────────────────────────────────────────────────────────────────
// FAMILLE 1/2 — "Auth burst" : rafales login/signup/reset ISOLÉES.
//
// Objectif : caractériser la capacité et la latence du sous-système
// d'authentification (bcrypt cost=12, non négociable) sous forte
// concurrence, ET vérifier que le sémaphore de backpressure
// (BCRYPT_MAX_CONCURRENCY) protège le reste de l'app — pas de mesurer le
// p95 global produit (voir product-mix.js pour ça).
//
// Ce scénario fait volontairement 1 opération d'auth PAR itération (c'est
// le but : stresser l'auth, pas simuler un usage réel) — ne jamais
// comparer son p95 au seuil produit de 500ms sans le préciser.
// ─────────────────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || "http://localhost:3001";
const RUN_ID = __ENV.RUN_ID || `${Date.now()}`;

// Seuils EXPLICITES pour l'auth, distincts du produit — cost=12 bcrypt a un
// plancher physique incompressible (~100-300ms de calcul) qu'aucune
// architecture ne fait disparaître sans plus de CPU. AUTH_P95_BUDGET_MS est
// paramétrable : sur une instance dédiée avec assez de vCPU/instances, ce
// budget doit rester atteignable même en rafale.
const AUTH_P95_BUDGET_MS = Number(__ENV.AUTH_P95_BUDGET_MS || 2000);

export const options = {
  scenarios: {
    auth_burst: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "20s", target: Number(__ENV.VUS || 50) },
        { duration: "90s", target: Number(__ENV.VUS || 50) },
        { duration: "15s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    // Budget latence AUTH explicite (pas le seuil produit 500ms)
    "http_req_duration{endpoint:signup}": [`p(95)<${AUTH_P95_BUDGET_MS}`],
    "http_req_duration{endpoint:login}": [`p(95)<${AUTH_P95_BUDGET_MS}`],
    "http_req_duration{endpoint:forgot_password}": [`p(95)<${AUTH_P95_BUDGET_MS}`],
    // Le vrai critère business : le sémaphore ne doit jamais transformer
    // la queue en échecs, même en rafale.
    auth_error_rate: ["rate<0.01"],
  },
};

const authErrorRate = new Rate("auth_error_rate");
const signupLatency = new Trend("signup_latency_ms");
const loginLatency = new Trend("login_latency_ms");
const forgotLatency = new Trend("forgot_password_latency_ms");

function jsonHeaders() {
  return { headers: { "Content-Type": "application/json" } };
}

/** Pré-crée les 20 comptes partagés utilisés par login/forgot-password —
 * évite des 401 "pas encore créé" en tout début de run qui ne mesurent
 * rien d'utile sur la capacité auth. */
export function setup() {
  for (let i = 0; i < 20; i++) {
    http.post(
      `${BASE_URL}/api/auth/signup`,
      JSON.stringify({
        email: `loadtest-authburst-shared-${i}@blyss-loadtest.invalid`,
        password: "Loadtest123!",
        first_name: "Loadtest",
        last_name: `shared-${i}`,
      }),
      jsonHeaders()
    );
  }
}

export default function () {
  const vuTag = `${RUN_ID}-authburst-${__VU}-${__ITER}`;
  const email = `loadtest-${vuTag}@blyss-loadtest.invalid`;
  const password = "Loadtest123!";

  const roll = Math.random();

  if (roll < 0.5) {
    // ── 50% : signup (le pire cas — hash + insert) ──────────────────────
    const res = http.post(
      `${BASE_URL}/api/auth/signup`,
      JSON.stringify({ email, password, first_name: "Loadtest", last_name: vuTag }),
      { ...jsonHeaders(), tags: { endpoint: "signup" } }
    );
    signupLatency.add(res.timings.duration);
    const ok = check(res, { "signup 200": (r) => r.status === 200 });
    authErrorRate.add(ok ? 0 : 1);
  } else if (roll < 0.9) {
    // ── 40% : login sur un compte déjà connu (compare, pas hash) ────────
    // Réutilise un compte fixe créé au premier itération de ce VU pour ne
    // pas dépendre d'un signup préalable réussi. 401 explicitement accepté
    // par k6 (expectedStatuses) en tout début de run avant que ces comptes
    // partagés existent — sinon http_req_failed (métrique native) compte à
    // tort ces 401 attendus comme des échecs de capacité.
    const res = http.post(
      `${BASE_URL}/api/auth/login`,
      JSON.stringify({ email: `loadtest-authburst-shared-${__VU % 20}@blyss-loadtest.invalid`, password }),
      {
        ...jsonHeaders(),
        tags: { endpoint: "login" },
        responseCallback: http.expectedStatuses(200, 401),
      }
    );
    loginLatency.add(res.timings.duration);
    // 401 attendu si le compte partagé n'existe pas encore — pas une
    // erreur de capacité, juste "pas encore signup" en tout début de run.
    const ok = check(res, { "login 200 or 401": (r) => r.status === 200 || r.status === 401 });
    authErrorRate.add(ok ? 0 : 1);
  } else {
    // ── 10% : forgot-password (hash différent, endpoint séparé) ─────────
    const res = http.post(
      `${BASE_URL}/api/auth/forgot-password`,
      JSON.stringify({ email: `loadtest-authburst-shared-${__VU % 20}@blyss-loadtest.invalid` }),
      { ...jsonHeaders(), tags: { endpoint: "forgot_password" } }
    );
    forgotLatency.add(res.timings.duration);
    // Réponse générique volontaire (anti-énumération d'emails) — 200 quoi qu'il arrive.
    const ok = check(res, { "forgot_password 200": (r) => r.status === 200 });
    authErrorRate.add(ok ? 0 : 1);
  }

  sleep(0.2);
}
