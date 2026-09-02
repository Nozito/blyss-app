import { defineConfig, devices } from "@playwright/test";

const CI = !!process.env.CI;

export default defineConfig({
  testDir: "./tests/e2e",
  // En CI, aucune reprise implicite : un flake doit être visible.
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:8080",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      // `npm run dev` (backend/package.json) = `ts-node server.ts` exécuté
      // depuis backend/ — le `cd backend` ici fournit ce CWD. Ne PAS repasser
      // un chemin `backend/server.ts` dans le script, sinon double préfixe.
      command: "npm run dev",
      cwd: "backend",
      url: "http://127.0.0.1:3001/api/health",
      timeout: 120_000,
      reuseExistingServer: !CI,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "npm run dev",
      url: "http://127.0.0.1:8080",
      timeout: 120_000,
      reuseExistingServer: !CI,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
