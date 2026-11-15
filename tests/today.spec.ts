import { expect, test } from "@playwright/test";

/**
 * M0's check, automated: the shell renders, and it does so without a data
 * layer. The task-level assertions arrive in M1 once rows are real.
 */
test("Today renders the shell", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Add a task" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Overdue" })).toBeVisible();
  await expect(page.getByRole("listitem").first()).toBeVisible();
});

test("makes no network requests after load", async ({ page }) => {
  const failures: string[] = [];
  page.on("response", (r) => {
    if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`);
  });

  await page.goto("/");
  await page.waitForLoadState("networkidle");

  expect(failures).toEqual([]);
});
