import { describe, expect, it } from "vitest";
import { civilDate, civilDayBounds } from "@/lib/time";

const hours = (b: [number, number]) => (b[1] - b[0]) / 3_600_000;

describe("civil day bounds on DST transition days", () => {
  it("Europe/Brussels: 23 h in spring, 25 h in autumn, 24 h otherwise (unchanged by the 0.6.0 fix)", () => {
    expect(civilDayBounds("2026-03-29", "Europe/Brussels")).toEqual([Date.UTC(2026, 2, 28, 23), Date.UTC(2026, 2, 29, 22)]);
    expect(hours(civilDayBounds("2026-10-25", "Europe/Brussels"))).toBe(25);
    expect(civilDayBounds("2026-06-01", "Europe/Brussels")).toEqual([Date.UTC(2026, 4, 31, 22), Date.UTC(2026, 5, 1, 22)]);
  });
  it("other zones: New York 23 h, Lord Howe 24.5 h", () => {
    expect(hours(civilDayBounds("2026-03-08", "America/New_York"))).toBe(23);
    expect(hours(civilDayBounds("2026-04-05", "Australia/Lord_Howe"))).toBe(24.5);
  });
  it("a zone whose DST starts at midnight (local 00:00 does not exist) starts the day at the transition", () => {
    const b = civilDayBounds("2026-09-06", "America/Santiago");
    expect(civilDate(b[0], null, "America/Santiago")).toBe("2026-09-06");
    expect(civilDate(b[0] - 1, null, "America/Santiago")).toBe("2026-09-05");
    expect(hours(b)).toBe(23);
  });
  it("consecutive days tile without gaps or overlaps", () => {
    for (const z of ["Europe/Brussels", "America/Santiago", "Australia/Lord_Howe"]) {
      let prev = civilDayBounds("2026-01-01", z);
      for (let d = 1; d < 365; d++) {
        const date = new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10);
        const cur = civilDayBounds(date, z);
        expect(cur[0]).toBe(prev[1]);
        prev = cur;
      }
    }
  });
});
