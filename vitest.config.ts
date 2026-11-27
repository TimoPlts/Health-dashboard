import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Tests must never touch the owner's real runtime folder (%LOCALAPPDATA%\Baseline: config, health DB, backups).
// Every test process gets a throwaway BASELINE_HOME and an explicit throwaway DATABASE_PATH; tests that need a
// database open ":memory:" or their own temp directory. tests/unit/isolation.test.ts asserts this.
const isolatedHome = mkdtempSync(path.join(os.tmpdir(), "baseline-vitest-"));

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
    env: {
      TZ: "UTC",
      BASELINE_HOME: isolatedHome,
      DATABASE_PATH: path.join(isolatedHome, "data", "test.db"),
      DEMO_MODE: "",
      BASELINE_DISABLE_SCHEDULER: "1",
    },
  },
});
