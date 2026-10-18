import { expect, test } from "@playwright/test";

test("a shared effort concern reaches the partner before either monthly check-in", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${process.env.SPARK_TEST_BASE_PATH ?? ""}/demo/`);
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Restore sample couple" }).click();
  await expect(page).toHaveURL(/\/home\//);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Check-in", exact: true }).click();

  const question = page.getByRole("group", { name: "Do I feel my partner has become too comfortable and stopped making an effort?", exact: true });
  const submit = page.getByRole("button", { name: /^Share with .+ now$/ });
  await question.getByRole("radio", { name: "No", exact: true }).check();
  await expect(submit).toBeDisabled();
  await question.getByRole("radio", { name: "Yes", exact: true }).check();
  await expect(page.getByRole("region", { name: "Needs attention" })).toHaveCount(0);
  await submit.click();
  const alert = page.getByRole("region", { name: "Needs attention" });
  await expect(alert).toBeVisible();

  await page.getByRole("button", { name: "Switch to Sam", exact: true }).click();
  await expect(alert.getByText(/feels you may have stopped making an effort/)).toBeVisible();
  await expect(alert.getByRole("button", { name: "Mark resolved" })).toHaveCount(0);
  const screenshot = testInfo.outputPath("partner-attention.png");
  await page.screenshot({ path: screenshot });
  await testInfo.attach("partner-attention.png", { path: screenshot, contentType: "image/png" });
  await alert.getByRole("button", { name: "Acknowledge", exact: true }).click();
  await expect(alert.getByText("You acknowledged this.")).toBeVisible();
  await page.reload();
  await expect(alert.getByText("You acknowledged this.")).toBeVisible();

  await page.getByRole("button", { name: "Switch to Alex", exact: true }).click();
  await alert.getByRole("button", { name: "Mark resolved", exact: true }).click();
  await expect(alert).toHaveCount(0);
  await page.getByRole("button", { name: "Switch to Sam", exact: true }).click();
  await expect(alert).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
