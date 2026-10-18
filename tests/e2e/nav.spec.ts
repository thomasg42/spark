import { expect, test } from "@playwright/test";

test("bottom nav stays pinned to the viewport while the page scrolls", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await page.goto(`${process.env.SPARK_TEST_BASE_PATH ?? ""}/plans/`);
  const nav = page.getByRole("navigation", { name: "Main" });
  const button = page.getByRole("button", { name: "Continue as Alex" });
  // Demo seed is already signed in. A fresh browser still shows the picker until that seed loads.
  await expect(nav.or(button)).toBeVisible();
  if (await button.isVisible()) {
    await expect(async () => {
      await button.click();
      await expect(page).toHaveURL(/\/(home|plans)\//, { timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    if (!page.url().includes("/plans")) await page.goto(`${process.env.SPARK_TEST_BASE_PATH ?? ""}/plans/`);
  }
  await expect(nav).toBeVisible();
  const measure = () => nav.evaluate((el) => Math.round(el.getBoundingClientRect().bottom));
  const before = await measure();
  const height = await page.evaluate(() => window.innerHeight);
  expect(Math.abs(before - height)).toBeLessThan(2);
  await testInfo.attach("nav-before.png", { body: await page.screenshot(), contentType: "image/png" });
  const scroller = page.locator("#app-scroll");
  await scroller.evaluate((el) => {
    const spacer = document.createElement("div");
    spacer.dataset.testid = "scroll-spacer";
    spacer.style.height = "150vh";
    el.appendChild(spacer);
  });
  const beforeTop = await scroller.evaluate((el) => el.scrollTop);
  await scroller.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  const afterTop = await scroller.evaluate((el) => el.scrollTop);
  expect(afterTop).toBeGreaterThan(beforeTop);
  const after = await measure();
  expect(Math.abs(after - height)).toBeLessThan(2);
  expect(Math.abs(after - before)).toBeLessThan(2);
  await testInfo.attach("nav-after.png", { body: await page.screenshot(), contentType: "image/png" });
});
