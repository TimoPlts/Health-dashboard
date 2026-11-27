import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { E2E_PASSWORD } from "../../playwright.config";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `screenshots/${test.info().project.name}-${name}.png`, fullPage: true });

async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serious = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.length} nodes — ${v.nodes[0]?.target}`)).toEqual([]);
}

test("unauthenticated requests are blocked", async ({ page, request }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  expect((await request.get("/api/sync")).status()).toBe(401);
  expect((await request.post("/api/sync")).status()).toBe(401);
});

test("wrong password is rejected", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Password").fill("nope");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Incorrect password")).toBeVisible();
  await expect(page.getByText("Baseline")).toBeVisible();
  await shot(page, "login");
});

const noOverflow = async (page: import("@playwright/test").Page) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
};

test("today, sleep, health, metric detail and trends render with demo data", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("status").filter({ hasText: "DEMO MODE" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await expect(page.getByRole("img", { name: /^Recovery/ })).toBeVisible();
  await expect(page.getByText("Last night")).toBeVisible();
  await page.waitForTimeout(500);
  await shot(page, "today"); await axe(page); await noOverflow(page);

  await page.getByRole("link", { name: "Sleep", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sleep" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Sleep stages over the night" })).toBeVisible();
  await shot(page, "sleep"); await axe(page); await noOverflow(page);

  await page.getByRole("button", { name: "Method", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "How the sleep score works" })).toBeVisible();
  await shot(page, "sheet");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("link", { name: "Health", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Health" })).toBeVisible();
  await shot(page, "health"); await axe(page); await noOverflow(page);

  await page.goto("/metric/resting_hr?range=90d");
  await expect(page.getByRole("heading", { name: "Resting heart rate" })).toBeVisible();
  await expect(page.getByText("Personal baseline")).toBeVisible();
  await shot(page, "metric"); await axe(page); await noOverflow(page);

  await page.goto("/trends");
  await expect(page.getByRole("heading", { name: "Trends" })).toBeVisible();
  await shot(page, "trends"); await axe(page); await noOverflow(page);
});

test("training, workout detail, exclusion and settings", async ({ page }) => {
  await login(page);
  await page.goto("/training");
  await expect(page.getByRole("heading", { name: "Training" })).toBeVisible();
  await shot(page, "training"); await axe(page); await noOverflow(page);

  await page.locator('a[href^="/training/demo-ex-fitbit"]').first().click();
  await expect(page.getByRole("img", { name: "Heart rate over time" })).toBeVisible();
  await expect(page.getByText("Hevy (via Apple Health)")).toBeVisible();
  await expect(page).toHaveTitle(/Workout · Baseline/);
  await shot(page, "workout"); await axe(page); await noOverflow(page);

  await page.getByRole("button", { name: "Exclude from analytics" }).click();
  await expect(page.getByText("Excluded from analytics")).toBeVisible();
  await page.getByRole("button", { name: "Include in analytics" }).click();
  await expect(page.getByRole("button", { name: "Exclude from analytics" })).toBeVisible();

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Google Health" })).toBeVisible();
  await expect(page.getByText("Next automatic sync")).toBeVisible();
  await shot(page, "settings"); await axe(page);
});

test("sleep detail, cardio and workout labels", async ({ page }) => {
  await login(page);
  await page.goto("/sleep");
  await expect(page.getByText("Tonight", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "Heart rate during the night" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Blood oxygen during the night" })).toBeVisible();
  await expect(page.getByText("Compared with other nights")).toBeVisible();
  await page.getByRole("button", { name: /Methods/ }).click();
  await expect(page.getByRole("dialog", { name: "How sleep is calculated" })).toBeVisible();
  await page.keyboard.press("Escape");
  await axe(page); await noOverflow(page);

  await page.goto("/cardio");
  await expect(page.getByRole("heading", { name: "Cardio" })).toBeVisible();
  await expect(page.getByText("Heart-rate zones this week")).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, "cardio"); await axe(page); await noOverflow(page);
  await page.getByRole("button", { name: "Heart-rate zones explained" }).click();
  await expect(page.getByRole("dialog", { name: "Heart-rate zones explained" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/training?range=90d&cat=push");
  await expect(page.getByRole("link", { name: /Push day/ }).first()).toBeVisible();
  await page.getByRole("link", { name: /Push day/ }).first().click();
  await expect(page.getByRole("heading", { name: "Push day" })).toBeVisible();
  await page.getByRole("button", { name: /Edit label/ }).click();
  const dlg = page.getByRole("dialog", { name: "Label workout" });
  await expect(dlg).toBeVisible();
  await shot(page, "workout-label");
  await dlg.getByRole("button", { name: "Effort 8" }).click();
  await dlg.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Effort 8/10")).toBeVisible();
  await axe(page); await noOverflow(page);
});

test("goals, journal and customisable Today", async ({ page }) => {
  await login(page);
  page.on("dialog", (d) => void d.accept());
  await page.goto("/goals");
  await expect(page.getByRole("heading", { name: "Goals" })).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, "goals"); await axe(page); await noOverflow(page);
  await page.getByRole("button", { name: "Edit" }).first().click();
  const g = page.getByRole("dialog", { name: "Goals" });
  await g.getByLabel("Steps goal").fill("10000");
  await g.getByRole("button", { name: "Save goals" }).click();
  await expect(page.getByText("/ 10,000").first()).toBeVisible();

  await page.goto("/journal");
  await expect(page.getByRole("heading", { name: "Journal" })).toBeVisible();
  const supplements = page.getByRole("group", { name: "Supplements" });
  await supplements.getByRole("button", { name: "Yes" }).click();
  await expect(supplements.getByRole("button", { name: "Yes" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Clear Supplements" }).click();
  await expect(supplements.getByRole("button", { name: "Yes" })).toHaveAttribute("aria-pressed", "false");
  await page.waitForTimeout(300);
  await shot(page, "journal"); await axe(page); await noOverflow(page);
  await page.getByRole("button", { name: "Manage habits" }).click();
  const m = page.getByRole("dialog", { name: "Manage habits" });
  await m.getByLabel("New habit name").fill("Meditation");
  await m.getByRole("button", { name: "Add", exact: true }).click();
  await expect(m.getByLabel("Name of Meditation").first()).toBeVisible();
  await shot(page, "habits");
  await page.keyboard.press("Escape");

  await page.goto("/");
  await expect(page.getByRole("link", { name: /Journal/ }).first()).toBeVisible();
  await page.getByRole("button", { name: "Customise Today" }).click();
  const c = page.getByRole("dialog", { name: "Customise Today" });
  await c.getByRole("switch", { name: "Show Workouts" }).click();
  await c.getByRole("button", { name: "Move Journal up" }).click();
  await shot(page, "customise");
  await c.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("No workouts recorded on this day.")).toHaveCount(0);
  await axe(page); await noOverflow(page);
  await page.getByRole("button", { name: "Customise Today" }).click();
  await page.getByRole("dialog", { name: "Customise Today" }).getByRole("button", { name: "Reset" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Workouts" })).toBeVisible();
});
