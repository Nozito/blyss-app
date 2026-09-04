import rateLimit from "express-rate-limit";
import { Request } from "express";

// Load-test bypass — opt-in, off by default, and double-gated so it can
// never activate on a deployed prod process even if the env var leaked into
// its environment: NODE_ENV must NOT be "production" AND the flag must be
// set explicitly. Used only to run k6 against a local backend instance
// (still hitting the real Supabase Cloud DB) without a single test-runner
// IP tripping every per-IP limiter within the first few requests — never
// set in .env.prod, never deployed.
function loadtestBypass(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.LOADTEST_BYPASS_RATE_LIMIT === "true";
}

// Per-IP limiters alone don't stop a distributed attack (many source IPs)
// aimed at one specific account. Keying by the submitted email/account
// identifier closes that gap — the two limiter types are complementary,
// both applied together on account-sensitive routes.
function accountKey(req: Request): string {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  if (typeof email === "string" && email.trim()) {
    return email.trim().toLowerCase();
  }
  return "no-account"; // shares one bucket across requests with no email — safe default, not a bypass
}

export const authLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skip: loadtestBypass,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "too_many_requests",
    message: "Trop de tentatives, réessayez dans 15 minutes.",
  },
});

// Same login endpoint, keyed by the targeted account instead of source IP —
// stops a distributed credential-stuffing attempt against one account from
// rotating IPs to dodge the limiter above.
export const authLoginAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: accountKey,
  skip: loadtestBypass,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "too_many_requests",
    message: "Trop de tentatives sur ce compte, réessayez dans 15 minutes.",
  },
});

export const authSignupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  skip: loadtestBypass,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "too_many_requests",
    message: "Trop de créations de compte, réessayez dans 1 heure.",
  },
});

export const authRefreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  skip: loadtestBypass,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "too_many_requests",
    message: "Trop de tentatives, réessayez dans 15 minutes.",
  },
});

// 20 réservations par heure par IP
export const bookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  skip: loadtestBypass,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "too_many_requests",
    message: "Trop de réservations, réessayez dans 1 heure.",
  },
});

// 30 actions de report (accept/decline/get) par 15 min par IP. Ces routes
// sont authentifiées et re-vérifient l'ownership, mais restent des écritures
// d'état sur une réservation — un limiter ferme le brute-force / spam d'IDs.
export const rescheduleLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  skip: loadtestBypass,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "too_many_requests",
    message: "Trop de requêtes, réessayez dans 15 minutes.",
  },
});

// 10 payment intents par 15 min par IP
export const paymentIntentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skip: loadtestBypass,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "too_many_requests",
    message: "Trop de tentatives de paiement, réessayez dans 15 minutes.",
  },
});

// 100 requêtes par 15 min pour les listes publiques (pros, services)
export const publicListingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  skip: loadtestBypass,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "too_many_requests",
    message: "Trop de requêtes, réessayez dans 15 minutes.",
  },
});

// 600 requêtes par 15 min pour les routes admin — le panel poll le compteur
// du dashboard toutes les 30s (30 requêtes/15min rien qu'en restant sur une
// page) et charge des jeux de données paginés en parallèle ; 60 était trop
// bas et faisait échouer des sections entières (ex: Sessions du profil) dès
// qu'un admin naviguait normalement pendant quelques minutes.
export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  skip: loadtestBypass,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "too_many_requests",
    message: "Trop de requêtes admin, réessayez dans 15 minutes.",
  },
});

// Onboarding client (#34) — flux court et ponctuel : 60 req / 15 min / IP,
// large pour le polling de /status + retries, sans exposer la reco (requête
// d'agrégation) à du flood.
export const onboardingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  skip: loadtestBypass,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "too_many_requests",
    message: "Trop de requêtes, réessayez dans 15 minutes.",
  },
});

// 15 souscriptions push par heure par IP (anti-spam)
export const pushLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 15,
  skip: loadtestBypass,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "too_many_requests",
    message: "Trop de tentatives, réessayez dans 1 heure.",
  },
});

// 3 demandes de reset par heure par IP (anti-spam email)
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  skip: () => process.env.NODE_ENV === "test" || loadtestBypass(),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "too_many_requests",
    message: "Trop de demandes de réinitialisation, réessayez dans 1 heure.",
  },
});

// Same route, keyed by the targeted account — an attacker spamming reset
// emails at one victim from rotating IPs (harassment/spam, not brute-force
// per se) still hits a wall here even though each IP looks fine on its own.
export const passwordResetAccountLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  keyGenerator: accountKey,
  skip: () => process.env.NODE_ENV === "test" || loadtestBypass(),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "too_many_requests",
    message: "Trop de demandes de réinitialisation pour ce compte, réessayez dans 1 heure.",
  },
});

// Token-consumption endpoint (POST /reset-password) — separate, more
// generous limit than the request-a-reset-email limiter above, since a
// legitimate user may mistype their new password a couple of times. Mainly
// defense-in-depth/DoS protection: the token itself is 32 random bytes and
// isn't practically brute-forceable.
export const passwordResetConsumeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skip: () => process.env.NODE_ENV === "test" || loadtestBypass(),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "too_many_requests",
    message: "Trop de tentatives, réessayez dans 15 minutes.",
  },
});

// 10 annulations par heure par IP (anti-abus)
export const cancellationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  skip: loadtestBypass,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "too_many_requests",
    message: "Trop de tentatives d'annulation, réessayez dans 1 heure.",
  },
});

// 20 inscriptions liste d'attente par heure par IP (anti-spam notifications)
export const waitingListLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "too_many_requests",
    message: "Trop de requêtes, réessayez dans 1 heure.",
  },
});

// 60 écritures nail-tech par heure par IP (notes, blocages, no-show)
export const nailTechWriteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "too_many_requests",
    message: "Trop de requêtes, réessayez dans 1 heure.",
  },
});
