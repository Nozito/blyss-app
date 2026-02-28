import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
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
      command: "cd backend && npm run dev",
      port: 3001,
      reuseExistingServer: true,
    },
    {
      command: "npm run dev",
      port: 8080,
      reuseExistingServer: true,
    },
  ],
});
