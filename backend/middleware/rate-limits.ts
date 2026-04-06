import rateLimit from "express-rate-limit";

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
