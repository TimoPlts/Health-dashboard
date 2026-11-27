/** Shared (server + client) value formatting for metric values. */
export function formatValue(v: number, format: "number" | "clock" | "hours" | undefined, decimals = 0, clockBase = 0) {
  if (format === "clock") {
    const m = Math.round((v + clockBase) % 1440);
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  }
  if (format === "hours") { const h = Math.floor(v), m = Math.round((v - h) * 60); return m === 60 ? `${h + 1}h 00m` : `${h}h ${String(m).padStart(2, "0")}m`; }
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(v);
}

