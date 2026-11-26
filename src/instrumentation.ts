/** Runs once per server start (Next.js instrumentation). Starts the automatic sync scheduler on the Node runtime. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { loadRuntimeConfig } = await import("./server/runtime-home");
  loadRuntimeConfig();
  const { startScheduler } = await import("./server/sync/scheduler");
  startScheduler();
}
