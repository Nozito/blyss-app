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
