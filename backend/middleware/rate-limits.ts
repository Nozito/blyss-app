import rateLimit from "express-rate-limit";
import { Request } from "express";

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
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "too_many_requests",
    message: "Trop de réservations, réessayez dans 1 heure.",
  },
});

// 10 payment intents par 15 min par IP
export const paymentIntentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "too_many_requests",
    message: "Trop de tentatives de paiement, réessayez dans 15 minutes.",
  },
});

// 5 mises à jour IBAN par heure par IP
export const ibanUpdateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "too_many_requests",
    message: "Trop de mises à jour bancaires, réessayez dans 1 heure.",
  },
});

// 100 requêtes par 15 min pour les listes publiques (pros, services)
export const publicListingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "too_many_requests",
    message: "Trop de requêtes, réessayez dans 15 minutes.",
  },
});

// 60 requêtes par 15 min pour les routes admin
export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "too_many_requests",
    message: "Trop de requêtes admin, réessayez dans 15 minutes.",
  },
});

// 15 souscriptions push par heure par IP (anti-spam)
export const pushLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 15,
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
  skip: () => process.env.NODE_ENV === "test",
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
  skip: () => process.env.NODE_ENV === "test",
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
  skip: () => process.env.NODE_ENV === "test",
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
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "too_many_requests",
    message: "Trop de tentatives d'annulation, réessayez dans 1 heure.",
  },
});

// Instagram OAuth & sync — 30 requêtes par 15 min par IP (inclut syncs manuels)
export const instagramLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "too_many_requests",
    message: "Trop de requêtes Instagram, réessayez dans 15 minutes.",
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
