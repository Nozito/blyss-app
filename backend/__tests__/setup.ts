/**
 * Setup global pour les tests backend.
 * Ce fichier s'exécute avant chaque test file (setupFiles dans vitest.config.ts).
 * Il doit définir les variables d'environnement AVANT que server.ts soit importé,
 * car dotenv.config() ne surécrit pas les vars déjà définies dans process.env.
 */

// Variables requises par server.ts au démarrage (sinon process.exit)
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret-at-least-32-chars-long-for-vitest";
process.env.STRIPE_SECRET_KEY = "sk_test_vitest_fake_key_not_real";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_vitest_fake_webhook_secret";
process.env.REVENUECAT_WEBHOOK_SECRET = "rc_test_fake_secret";
// Requis par server.ts depuis le fix 2FA (fd39dac) : 64 hex = 32 octets AES-256-GCM.
// Absent ici → server.ts fait process.exit(1) au chargement et TOUTE la suite
// tombe en "process.exit unexpectedly called with 1" (CI rouge depuis 2026-08-26,
// masqué en local par TOTP_ENC_KEY présent dans .env.dev / .env.test).
process.env.TOTP_ENC_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

// Base de données Supabase — non utilisée réellement (lib/db est mocké dans chaque test)
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test_blyss";
process.env.PORT = "0";
process.env.FRONTEND_URL = "http://localhost:5173";
