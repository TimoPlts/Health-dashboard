import { describe, expect, it } from "vitest";
import path from "node:path";
import { assertSafeLocation, baselineHome, parseEnvFile, runtimePaths, UnsafePathError } from "@/server/runtime-home";

const win = process.platform === "win32";
const env = (extra: Record<string, string> = {}) => ({ ...extra }) as NodeJS.ProcessEnv;

describe("baselineHome", () => {
  it("uses %LOCALAPPDATA%\\Baseline on Windows", () => {
    expect(baselineHome(env({ LOCALAPPDATA: "C:\\Users\\x\\AppData\\Local" }), "win32")).toBe(path.join("C:\\Users\\x\\AppData\\Local", "Baseline"));
  });
  it("honours BASELINE_HOME override", () => {
    expect(baselineHome(env({ BASELINE_HOME: "/srv/baseline" }), "linux")).toBe(path.resolve("/srv/baseline"));
  });
  it("derives every sensitive path from the home", () => {
    const p = runtimePaths(path.resolve("/h"));
    for (const v of [p.configFile, p.database, p.backups, p.exports, p.probeOutput, p.logs]) expect(v.startsWith(path.resolve("/h"))).toBe(true);
  });
});

describe("assertSafeLocation", () => {
  const repo = path.resolve(win ? "C:\\repo" : "/repo");
  const od = path.resolve(win ? "C:\\Users\\x\\OneDrive - School" : "/home/x/OneDrive - School");
  it("rejects paths inside OneDrive (env-detected)", () => {
    expect(() => assertSafeLocation(path.join(od, "Desktop", "baseline.db"), { repoRoot: repo, env: env({ OneDrive: od }) })).toThrow(UnsafePathError);
  });
  it("rejects OneDrive-looking paths even without env vars", () => {
    expect(() => assertSafeLocation(path.resolve("/x/OneDrive - Org/y/db.db"), { repoRoot: repo, env: env() })).toThrow(UnsafePathError);
  });
  it("rejects paths inside the repository", () => {
    expect(() => assertSafeLocation(path.join(repo, "data", "baseline.db"), { repoRoot: repo, env: env() })).toThrow(/repository/);
  });
  it("accepts a private local app-data path", () => {
    const local = path.resolve(win ? "C:\\Users\\x\\AppData\\Local\\Baseline\\data\\baseline.db" : "/home/x/.local/share/baseline/data/baseline.db");
    expect(() => assertSafeLocation(local, { repoRoot: repo, env: env({ OneDrive: od }) })).not.toThrow();
  });
  it("is case-insensitive and does not match sibling prefixes", () => {
    expect(() => assertSafeLocation(path.join(repo + "-other", "db"), { repoRoot: repo, env: env() })).not.toThrow();
    if (win) expect(() => assertSafeLocation("c:\\REPO\\x.db", { repoRoot: repo, env: env() })).toThrow();
  });
});

describe("parseEnvFile", () => {
  it("parses keys, ignores comments and strips quotes", () => {
    expect(parseEnvFile("# c\nA=1\nB = \"two=2\"\n\nC='x'\nbad line\n")).toEqual({ A: "1", B: "two=2", C: "x" });
  });
});
