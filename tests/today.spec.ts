import { expect, test, type Page } from "@playwright/test";

/**
 * The M1 loop against the real database: capture, persist across a reload,
 * complete, undo.
 *
 * Each run gets a fresh browser context, so each run mints its own guest owner
 * and leaves a row behind. That is what the prune cron in M8 is for — an
 * unclaimed guest with no recent activity is exactly what it deletes. Titles are
 * unique per run so parallel projects never see each other's tasks.
 */
const unique = () => `e2e ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/**
 * The task's own row, not any text that happens to contain the title — the undo
 * toast quotes it too, which makes a bare `getByText` ambiguous.
 */
const taskRow = (page: Page, title: string) =>
  page.getByRole("button", { name: title, exact: true });

async function capture(page: Page, title: string) {
  const input = page.getByRole("textbox", { name: "Add a task" });
  await input.fill(title);
  await input.press("Enter");
  await expect(taskRow(page, title)).toBeVisible();
  return input;
}

test("renders the shell with no account and no data", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Add a task" })).toBeVisible();
  // A visitor who has never written anything sees the empty state, not a spinner.
  await expect(page.getByRole("heading", { name: "Nothing due today" })).toBeVisible();
});

test("captures a task and persists it across a reload", async ({ page }) => {
  const title = unique();
  await page.goto("/");

  const input = await capture(page, title);
  // Consecutive adds are the point: the box clears without waiting on the write.
  await expect(input).toHaveValue("");

  await page.reload();
  await expect(taskRow(page, title)).toBeVisible();
});

test("keeps focus in the capture box for the next task", async ({ page, isMobile }) => {
  // Skipped on mobile: soft-keyboard focus behaviour is its own problem, and
  // M6 owns pinning capture above the keyboard.
  test.skip(!!isMobile, "desktop focus model only");

  const title = unique();
  await page.goto("/");

  const input = await capture(page, title);
  await expect(input).toBeFocused();
});

test("completing a task removes it, and undo brings it back", async ({ page }) => {
  const title = unique();
  await page.goto("/");
  await capture(page, title);

  await page.getByRole("checkbox", { name: `Complete ${title}` }).click();
  await expect(taskRow(page, title)).toBeHidden();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(taskRow(page, title)).toBeVisible();

  // And it is really back in the database, not just on screen.
  await page.reload();
  await expect(taskRow(page, title)).toBeVisible();
});

test("a page view issues no failed requests", async ({ page }) => {
  const failures: string[] = [];
  page.on("response", (r) => {
    if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`);
  });

  await page.goto("/");
  await page.waitForLoadState("networkidle");

  expect(failures).toEqual([]);
});

test("shows chips for what it parsed before anything is saved", async ({ page }) => {
  const title = unique();
  await page.goto("/");

  const input = page.getByRole("textbox", { name: "Add a task" });
  await input.fill(`${title} friday p1`);

  // The chips are the contract: you see the guess before it is committed.
  await expect(page.getByRole("button", { name: "Don't apply P1" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Don't apply Fri/ })).toBeVisible();

  // Nothing has been written yet — the preview is purely local.
  await expect(taskRow(page, title)).toBeHidden();
});

test("applies a parsed priority to a task due today", async ({ page }) => {
  const title = unique();
  await page.goto("/");

  const input = page.getByRole("textbox", { name: "Add a task" });
  await input.fill(`${title} p1`);
  await input.press("Enter");

  // Undated capture on Today lands on Today, so the row is here with its flag.
  await expect(taskRow(page, title)).toBeVisible();
  await expect(page.getByTitle("Priority 1")).toBeVisible();
});

test("a task parsed onto a future date leaves the Today view", async ({ page }) => {
  const title = unique();
  await page.goto("/");

  const input = page.getByRole("textbox", { name: "Add a task" });
  await input.fill(`${title} friday`);
  await input.press("Enter");

  // Correct, and currently a dead end: the task exists but Upcoming does not
  // arrive until M3, so there is nowhere to see it. Asserted so the gap is
  // recorded rather than discovered as a bug.
  await expect(taskRow(page, title)).toBeHidden();
});

test("does not invent a time from a sentence that merely contains a number", async ({ page }) => {
  await page.goto("/");

  const input = page.getByRole("textbox", { name: "Add a task" });
  await input.fill("meet at 5 guys");

  // Nothing is consumed, so there is nothing to dismiss — and crucially no
  // 5pm task appears on something the user never looked at again.
  await expect(page.getByRole("button", { name: /Don't apply/ })).toHaveCount(0);
});

test("a dismissed chip returns its token to the title", async ({ page }) => {
  const title = unique();
  await page.goto("/");

  const input = page.getByRole("textbox", { name: "Add a task" });
  await input.fill(`${title} p1`);
  await page.getByRole("button", { name: "Don't apply P1" }).click();

  await input.press("Enter");
  // "p1" is part of the name now, not a priority.
  await expect(taskRow(page, `${title} p1`)).toBeVisible();
});
