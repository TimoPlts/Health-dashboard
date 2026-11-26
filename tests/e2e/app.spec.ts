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

test("today, training, workout detail and settings render with demo data", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("status")).toContainText("DEMO MODE");
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await expect(page.getByText("Last night")).toBeVisible();
  await expect(page.getByText("Resting HR")).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, "today");
  await axe(page);

  // No horizontal overflow at phone width
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await page.getByRole("link", { name: "Training" }).click();
  await expect(page.getByRole("heading", { name: "Training" })).toBeVisible();
  await shot(page, "training");
  await axe(page);

  await page.locator('a[href^="/training/"]').first().click();
  await expect(page.getByText("Heart rate · Fitbit Air")).toBeVisible();
  await expect(page.getByRole("img", { name: "Heart rate over time" })).toBeVisible();
  await shot(page, "workout");
  await axe(page);

  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Google Health" })).toBeVisible();
  await shot(page, "settings");
  await axe(page);
});
