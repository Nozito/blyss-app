import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Exécuté avant chaque fichier de test (définit les vars d'env)
    setupFiles: ["./backend/__tests__/setup.ts"],
    include: ["backend/__tests__/**/*.test.ts"],
    // Isolation par process pour éviter la pollution d'état entre fichiers
    pool: "forks",
    // Timeout raisonnable pour les tests d'intégration légers
    testTimeout: 10000,
  },
});
