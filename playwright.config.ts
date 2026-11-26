import { defineConfig, devices } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { hashPassword } from "./src/server/crypto";

/**
 * E2E runs the app in DEMO_MODE against the fictional ./data/demo.db (run `npm run db:seed-demo` first).
 * Throwaway secrets are generated per run; nothing here touches .env.local or real data.
 */
export const E2E_PASSWORD = "e2e-password-not-secret";
const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "iphone-dark", use: { ...devices["iPhone 15 Pro"], browserName: "chromium", colorScheme: "dark" } },
    { name: "iphone-light", use: { ...devices["iPhone 15 Pro"], browserName: "chromium", colorScheme: "light" } },
    { name: "desktop", use: { viewport: { width: 1280, height: 900 }, colorScheme: "dark" } },
  ],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DEMO_MODE: "1",
      APP_PASSWORD_HASH: hashPassword(E2E_PASSWORD),
      SESSION_SECRET: randomBytes(32).toString("base64"),
      ENCRYPTION_KEY: randomBytes(32).toString("base64"),
      APP_BASE_URL: `http://localhost:${PORT}`,
      HOME_TIME_ZONE: "Europe/Brussels",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
