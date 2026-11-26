import { loadRuntimeConfig } from "../src/server/runtime-home";

/** CLI scripts read the same runtime config as the web app: <BASELINE_HOME>/config.env. */
loadRuntimeConfig();
