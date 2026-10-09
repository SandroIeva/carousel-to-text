import { test, expect } from "@playwright/test";
test("landing and login work without horizontal overflow", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Carousel in/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
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
