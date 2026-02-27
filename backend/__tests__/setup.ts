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

// Clés de chiffrement IBAN — valeurs fixes pour les tests
// IBAN_ENC_KEY : 32 octets = 64 hex chars
process.env.IBAN_ENC_KEY =
  "0101010101010101010101010101010101010101010101010101010101010101";
// IBAN_ENC_IV supprimée (Sprint 1 : IV aléatoire par enregistrement, plus de clé statique)

// Base de données Supabase — non utilisée réellement (lib/db est mocké dans chaque test)
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test_blyss";
process.env.PORT = "0";
process.env.FRONTEND_URL = "http://localhost:5173";

// Variables Instagram (optionnelles mais évitent des warnings)
process.env.INSTAGRAM_APP_ID = "test_ig_app_id";
process.env.INSTAGRAM_APP_SECRET = "test_ig_app_secret";
process.env.INSTAGRAM_REDIRECT_URI = "http://localhost:3001/api/instagram/callback";
process.env.INSTAGRAM_ENC_KEY =
  "0202020202020202020202020202020202020202020202020202020202020202";
process.env.INSTAGRAM_ENC_IV = "020202020202020202020202";
