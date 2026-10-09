import { test, expect } from "@playwright/test";
test("landing and login work without horizontal overflow", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Gute Inhalte/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Kostenlos starten" }).click();
  await expect(page.getByLabel("E-Mail")).toBeVisible();
  await expect(page.getByLabel("Passwort")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("private dashboard requires login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});
