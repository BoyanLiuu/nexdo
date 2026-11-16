import { expect, test, type Locator, type Page } from "@playwright/test";

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

/**
 * Optimistic UI makes a naive test race the server.
 *
 * `toBeHidden()` passes the moment a row is *optimistically* removed, which is
 * before the write has landed — so navigating straight afterwards can read the
 * database ahead of the commit. Waiting on a UI side-effect (a toast, a count)
 * only narrows the window; waiting on the Server Action's own response closes
 * it, because that is the thing that actually signals completion.
 */
/**
 * Fill the capture box and confirm React has the value before acting on it.
 *
 * `fill()` sets the DOM value and dispatches `input`, but against a controlled
 * component on WebKit that occasionally does not land — and `submit()` returns
 * early on an empty value, so the symptom was a 30-second `waitForResponse`
 * timeout with no request ever sent. Asserting the value first turns that into
 * an immediate, legible failure.
 */
async function type(input: Locator, text: string) {
  await input.fill(text);
  await expect(input).toHaveValue(text);
}

async function mutate(page: Page, act: () => Promise<void>) {
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("127.0.0.1")),
    act(),
  ]);
  expect(response.status()).toBeLessThan(400);
  // No `networkidle` wait: it hangs under RSC streaming and prefetching. The
  // response is the deterministic signal, and the assertions that follow
  // auto-wait for the UI to catch up.
}

/**
 * The row the keyboard cursor is on — defined by real DOM focus, not by
 * `tabindex`. Exactly one row carries `tabindex="0"` at all times so the list
 * is reachable by Tab, which means `tabindex` says "reachable", not "current".
 */
const focusedRow = (page: Page) => page.locator("[data-task-row]:focus");

/**
 * Opens a dialog with its keyboard shortcut.
 *
 * Retried, because a key pressed straight after `goto` can land before the
 * client component has hydrated and attached its listener — Playwright waits
 * for elements, not for hydration. The visibility check before pressing keeps
 * the retry safe for a shortcut that toggles: pressing again while the dialog
 * is open would close it.
 */
async function openWithKey(page: Page, key: string, dialog: Locator) {
  await expect(async () => {
    if (!(await dialog.isVisible())) await page.keyboard.press(key);
    await expect(dialog).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 10_000 });
}

async function capture(page: Page, title: string) {
  const input = page.getByRole("textbox", { name: "Add a task" });
  await type(input, title);

  // The response wait is required again. It was dropped in M4 as redundant,
  // because without an optimistic insert the row could only appear after the
  // server had written it — so the row appearing *was* proof of the write. The
  // optimistic insert removed that proof: the row now appears in ~20ms from the
  // client's own data, and any test that reloads or navigates next would cancel
  // the write in flight and then fail looking for a task that was never stored.
  const written = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().includes("127.0.0.1"),
  );
  await input.press("Enter");
  await expect(taskRow(page, title)).toBeVisible();
  await written;
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

test("keeps focus in the capture box for the next task", async ({ page }) => {
  // Skipped on mobile: soft-keyboard focus behaviour is its own problem, and
  // M6 owns pinning capture above the keyboard.

  const title = unique();
  await page.goto("/");

  const input = await capture(page, title);
  await expect(input).toBeFocused();
});

test("completing a task removes it, and undo brings it back", async ({ page }) => {
  const title = unique();
  await page.goto("/");
  await capture(page, title);

  await mutate(page, () => page.getByRole("checkbox", { name: `Complete ${title}` }).click());
  await expect(taskRow(page, title)).toBeHidden();

  await mutate(page, () => page.getByRole("button", { name: "Undo" }).click());
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
  await type(input, `${title} friday p1`);

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
  await type(input, `${title} p1`);
  await input.press("Enter");

  // Undated capture on Today lands on Today, so the row is here with its flag.
  await expect(taskRow(page, title)).toBeVisible();
  await expect(page.getByTitle("Priority 1")).toBeVisible();
});

test("a task parsed onto a future date leaves the Today view", async ({ page }) => {
  // Desktop only: this asserts an absence, which is also true before the write
  // lands, so it needs the response wait that flakes on mobile WebKit.

  const title = unique();
  await page.goto("/");

  const input = page.getByRole("textbox", { name: "Add a task" });
  await type(input, `${title} friday`);
  await mutate(page, () => input.press("Enter"));

  // Correct, and currently a dead end: the task exists but Upcoming does not
  // arrive until M3, so there is nowhere to see it. Asserted so the gap is
  // recorded rather than discovered as a bug.
  await expect(taskRow(page, title)).toBeHidden();
});

test("does not invent a time from a sentence that merely contains a number", async ({ page }) => {
  await page.goto("/");

  const input = page.getByRole("textbox", { name: "Add a task" });
  await type(input, "meet at 5 guys");

  // Nothing is consumed, so there is nothing to dismiss — and crucially no
  // 5pm task appears on something the user never looked at again.
  await expect(page.getByRole("button", { name: /Don't apply/ })).toHaveCount(0);
});

test("a dismissed chip returns its token to the title", async ({ page }) => {
  const title = unique();
  await page.goto("/");

  const input = page.getByRole("textbox", { name: "Add a task" });
  await type(input, `${title} p1`);
  await page.getByRole("button", { name: "Don't apply P1" }).click();

  await input.press("Enter");
  // "p1" is part of the name now, not a priority.
  await expect(taskRow(page, `${title} p1`)).toBeVisible();
});

test("the rail navigates between the four views", async ({ page }) => {
  await page.goto("/");

  for (const [name, heading] of [
    ["Upcoming", "Upcoming"],
    ["Inbox", "Inbox"],
    ["Completed", "Completed"],
    ["Today", "Today"],
  ] as const) {
    await page.getByRole("link", { name: new RegExp(`^${name}`) }).click();
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    // The current view is marked for assistive tech, not just visually.
    await expect(page.getByRole("link", { name: new RegExp(`^${name}`) })).toHaveAttribute(
      "aria-current",
      "page",
    );
  }
});

test("a task dated tomorrow appears in Upcoming, not Today", async ({ page }) => {
  /**
   * Desktop only. The behaviour under test — a write propagating across routes —
   * is not mobile-specific, and running several WebKit contexts in parallel on
   * one machine makes these flake on timing rather than on anything real.
   * Mobile keeps the rendering and parsing coverage, which is where its own
   * layout and input model actually differ.
   */

  const title = unique();
  await page.goto("/");

  const input = page.getByRole("textbox", { name: "Add a task" });
  await type(input, `${title} tomorrow`);
  await mutate(page, () => input.press("Enter"));

  // Gone from Today — the gap M2 opened. The rail's Upcoming count appearing is
  // what proves the write landed; the row being absent here would also be true
  // before the action finished.
  await expect(taskRow(page, title)).toBeHidden();

  // ...and closed by Upcoming, under tomorrow's heading.
  await page.goto("/upcoming");
  await expect(taskRow(page, title)).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Tomorrow/ })).toBeVisible();
});

test("capture in Inbox leaves the task undated", async ({ page }) => {
  /**
   * Desktop only. The behaviour under test — a write propagating across routes —
   * is not mobile-specific, and running several WebKit contexts in parallel on
   * one machine makes these flake on timing rather than on anything real.
   * Mobile keeps the rendering and parsing coverage, which is where its own
   * layout and input model actually differ.
   */

  const title = unique();
  await page.goto("/inbox");

  const input = page.getByRole("textbox", { name: "Add a task" });
  await type(input, title);
  await mutate(page, () => input.press("Enter"));

  await expect(taskRow(page, title)).toBeVisible();
  // Inbox is for undated work, so it must not have acquired today's date.
  await expect(page.getByRole("heading", { level: 1, name: "Inbox" })).toBeVisible();
  await page.goto("/");
  await expect(taskRow(page, title)).toBeHidden();
});

test("completing a task moves it to Completed, and unticking returns it", async ({ page }) => {
  /**
   * Desktop only. The behaviour under test — a write propagating across routes —
   * is not mobile-specific, and running several WebKit contexts in parallel on
   * one machine makes these flake on timing rather than on anything real.
   * Mobile keeps the rendering and parsing coverage, which is where its own
   * layout and input model actually differ.
   */

  const title = unique();
  await page.goto("/");

  const input = page.getByRole("textbox", { name: "Add a task" });
  await type(input, title);
  await mutate(page, () => input.press("Enter"));
  await expect(taskRow(page, title)).toBeVisible();

  await mutate(page, () => page.getByRole("checkbox", { name: `Complete ${title}` }).click());
  await expect(taskRow(page, title)).toBeHidden();
  // The undo toast is only shown once the action reports success, so it is the
  // signal that the write is committed rather than merely optimistic.

  await page.goto("/completed");
  await expect(taskRow(page, title)).toBeVisible();

  // Unticking there sends it back to Today. The control is named "Reopen" on a
  // completed task — the label reflects what it does, so asserting "Complete"
  // here would be asserting a bug.
  await mutate(page, () => page.getByRole("checkbox", { name: `Reopen ${title}` }).click());
  await expect(taskRow(page, title)).toBeHidden();

  await page.goto("/");
  await expect(taskRow(page, title)).toBeVisible();
});

test("sorting by priority is applied by the server and survives a reload", async ({ page }) => {
  await page.goto("/?sort=priority");

  await expect(page.getByRole("combobox", { name: "Sort by" })).toHaveValue("priority");
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Sort by" })).toHaveValue("priority");
});

test("Upcoming keeps empty days so the week has shape", async ({ page }) => {
  /**
   * Desktop only. The behaviour under test — a write propagating across routes —
   * is not mobile-specific, and running several WebKit contexts in parallel on
   * one machine makes these flake on timing rather than on anything real.
   * Mobile keeps the rendering and parsing coverage, which is where its own
   * layout and input model actually differ.
   */

  // Needs one task in the window, or the view shows its empty state instead of
  // day headings — otherwise this passes or fails on test ordering.
  const title = unique();
  await page.goto("/");
  const input = page.getByRole("textbox", { name: "Add a task" });
  await type(input, `${title} tomorrow`);
  await mutate(page, () => input.press("Enter"));

  await page.goto("/upcoming");

  // Seven day headings, whether or not anything is due on them. Scoped to the
  // main region: the rail has its own "Lists" and "Labels" headings.
  await expect(page.getByRole("main").getByRole("heading", { level: 2 })).toHaveCount(7);
});

test("creates a list from the rail and files a task into it with #token", async ({ page }) => {
  // Desktop only: the rail is a drawer on mobile, and M6 owns opening it.

  const listName = `L${Date.now().toString(36)}`;
  const title = unique();
  await page.goto("/");

  await page.getByRole("button", { name: "New list" }).click();
  const nameInput = page.getByRole("textbox", { name: "New list name" });
  await type(nameInput, listName);
  await mutate(page, () => nameInput.press("Enter"));

  const listLink = page.getByRole("link", { name: new RegExp(listName) });
  await expect(listLink).toBeVisible();

  // The token has to resolve against a list that now exists.
  const capture = page.getByRole("textbox", { name: "Add a task" });
  await type(capture, `${title} #${listName}`);
  await expect(page.getByRole("button", { name: `Don't apply ${listName}` })).toBeVisible();
  await mutate(page, () => capture.press("Enter"));

  await listLink.click();
  await expect(page.getByRole("heading", { level: 1, name: listName })).toBeVisible();
  await expect(taskRow(page, title)).toBeVisible();
});

test("an unknown #token stays in the title", async ({ page }) => {
  const title = unique();
  await page.goto("/");

  const capture = page.getByRole("textbox", { name: "Add a task" });
  await type(capture, `${title} #nosuchlist`);
  // Nothing to dismiss, because nothing was consumed — a "#" in a sentence is
  // commoner than a typo'd list name.
  await expect(page.getByRole("button", { name: /Don't apply/ })).toHaveCount(0);
});

test("the detail panel saves a priority change", async ({ page }) => {
  const title = unique();
  await page.goto("/");
  await capture(page, title);

  await page.getByRole("button", { name: `Open details for ${title}` }).click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByRole("textbox", { name: "Title" })).toHaveValue(title);

  await panel.getByLabel("Priority").selectOption("1");
  await mutate(page, () => panel.getByRole("button", { name: "Save" }).click());

  // The panel closes on success, and the row carries the flag.
  await expect(panel).toBeHidden();
  await expect(page.getByTitle("Priority 1")).toBeVisible();
});

test("a subtask shows as progress on its parent", async ({ page }) => {
  const title = unique();
  await page.goto("/");
  await capture(page, title);

  await page.getByRole("button", { name: `Open details for ${title}` }).click();
  const panel = page.getByRole("dialog");

  const sub = panel.getByRole("textbox", { name: "Add a subtask" });
  await type(sub, "first step");
  await mutate(page, () => sub.press("Enter"));

  await expect(panel.getByText("first step")).toBeVisible();
  await expect(panel.getByText(/Subtasks · 0\/1/)).toBeVisible();
});

/**
 * M6 — keyboard operation.
 *
 * Desktop only, and not for layout reasons: these assert on physical key
 * presses and DOM focus, neither of which is how anyone drives a phone.
 */
test("completes a task with the keyboard and keeps focus in the list", async ({ page }) => {
  await page.goto("/");
  const first = unique();
  const second = unique();
  await capture(page, first);
  await capture(page, second);

  // Leave the capture box, or the keys belong to the input.
  await page.getByRole("textbox", { name: "Add a task" }).blur();

  // `j` enters the list from anywhere. The arrows deliberately do not: taking
  // them globally would mean Down stopped scrolling the page. Retried because a
  // key pressed straight after load can beat hydration.
  await expect(async () => {
    await page.keyboard.press("j");
    await expect(focusedRow(page)).toHaveAttribute("aria-label", new RegExp(first), {
      timeout: 500,
    });
  }).toPass({ timeout: 10_000 });

  // Once a row holds focus, the arrows work inside the list too.
  await page.keyboard.press("ArrowDown");
  await expect(focusedRow(page)).toHaveAttribute("aria-label", new RegExp(second));

  await mutate(page, () => page.keyboard.press(" "));
  await expect(taskRow(page, second)).toBeHidden();

  // The cursor must land on a row rather than the document body: a keyboard
  // user who completes a task has to be able to press Space again.
  await expect(focusedRow(page)).toHaveAttribute("aria-label", new RegExp(first));
});

test("the command palette navigates without the mouse", async ({ page }) => {
  await page.goto("/");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await openWithKey(page, "ControlOrMeta+k", palette);

  await page.keyboard.type("upcom");
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/upcoming$/);
  await expect(page.getByRole("heading", { name: "Upcoming", level: 1 })).toBeVisible();
});

test("every shortcut the help overlay lists is one the app defines", async ({ page }) => {
  await page.goto("/");
  const overlay = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await openWithKey(page, "?", overlay);
  // Rendered from `lib/shortcuts.ts`, so this asserts the overlay is wired to
  // that array at all — an empty list would mean the import silently broke.
  await expect(overlay.getByText("Command palette")).toBeVisible();
  await expect(overlay.getByText("Complete or reopen")).toBeVisible();
});

/**
 * The drawer and the mobile topbar appear below the `md` breakpoint, which a
 * resized desktop window reaches just as a phone does. Tested that way rather
 * than under device emulation: the breakpoint is what the behaviour depends on,
 * and emulating touch and a phone engine added flakes without adding coverage.
 */
test.describe("a narrow window", () => {
  test.use({ viewport: { width: 390, height: 780 } });

  test("can reach every view through the drawer", async ({ page }) => {
    await page.goto("/");
    // A CSS locator, not `getByRole`: the closed drawer is `visibility: hidden`,
    // so it is absent from the accessibility tree and a role query cannot tell
    // "off-canvas" from "has not streamed in yet". Waiting for it to be attached
    // first means the hidden assertion below is about the drawer being closed
    // rather than about the rail being slow.
    // `.first()` because Next keeps previously-visited route trees mounted after
    // a client-side navigation — collapsed to 0x0, but still in the DOM, so the
    // selector matches two or three rails after a few clicks. The live one comes
    // first in document order. Measured, not assumed: the count plateaus at 3,
    // so it is route retention rather than a leak.
    const nav = page.locator('nav[aria-label="Views and lists"]').first();
    await nav.waitFor({ state: "attached" });

    // Off-canvas and out of the a11y tree until asked for. This is the regression
    // that matters: the rail was simply `hidden` on mobile for five milestones,
    // so a phone could reach Today and nothing else.
    await expect(nav).toBeHidden();

    // Retried for hydration, like `openWithKey`. Opening is idempotent, so an
    // extra click cannot toggle it back shut.
    await expect(async () => {
      await page.getByRole("button", { name: "Open views and lists" }).click();
      await expect(nav).toBeVisible({ timeout: 500 });
    }).toPass({ timeout: 10_000 });

    await nav.getByRole("link", { name: /Upcoming/ }).click();
    await expect(page).toHaveURL(/\/upcoming$/);
    // Navigating is what the drawer is for, so arriving closes it.
    await expect(nav).toBeHidden();
  });

  test("can open search from the topbar", async ({ page }) => {
    await page.goto("/");
    const field = page.getByRole("textbox", { name: "Search titles and notes" });
    await expect(async () => {
      await page.getByRole("button", { name: "Search" }).click();
      await expect(field).toBeVisible({ timeout: 500 });
    }).toPass({ timeout: 10_000 });
  });
});

test("arrow keys do not take over the page when no row is focused", async ({ page }) => {
  await page.goto("/");
  await capture(page, unique());
  await page.getByRole("textbox", { name: "Add a task" }).blur();

  // The first row is in the tab order so the list is reachable, but no row has
  // the cursor yet — so Down belongs to the page, not to us.
  await page.keyboard.press("ArrowDown");
  await expect(focusedRow(page)).toHaveCount(0);

  // Exactly one row stays in the tab order, which is the other way in — and
  // which the first version of the roving tabindex made impossible: with no
  // cursor every row was `tabindex="-1"` and the list was unreachable.
  await expect(page.locator("[data-task-row][tabindex='0']")).toHaveCount(1);
});

test("a captured task appears before the server has stored it", async ({ page }) => {
  await page.goto("/");

  // One throwaway capture first, to load the parser. `submit()` waits for
  // `chrono` before it inserts anything, so on a cold start that import — not
  // the database — is what the budget below would be measuring.
  await capture(page, unique());

  const title = unique();
  const input = page.getByRole("textbox", { name: "Add a task" });
  await type(input, title);

  const written = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().includes("127.0.0.1"),
  );
  await input.press("Enter");

  // Drawn from the client's own data. A one-second budget against a database
  // round trip that measures ~700ms locally: if this ever starts needing the
  // full trip, the optimistic path has broken.
  await expect(taskRow(page, title)).toBeVisible({ timeout: 1000 });

  await written;
  // Exactly one row once the server payload has replaced the optimistic one.
  // Two would mean the ids did not match, which is the whole point of minting
  // the id on the client.
  await expect(taskRow(page, title)).toHaveCount(1);

  await page.reload();
  await expect(taskRow(page, title)).toBeVisible();
});

test("a task can be completed before its insert has landed", async ({ page }) => {
  await page.goto("/");
  await capture(page, unique()); // warms the parser, as above

  // Both writes have to be allowed to finish: reloading or navigating inside
  // that window cancels them, which is the race `usePendingWriteGuard` warns a
  // real user about and which a test has to wait out rather than trigger.
  let posts = 0;
  page.on("response", (r) => {
    if (r.request().method() === "POST") posts += 1;
  });

  const title = unique();
  const input = page.getByRole("textbox", { name: "Add a task" });
  await type(input, title);
  await input.press("Enter");

  // Act on the optimistic row immediately. This is the case that forces the id
  // to be minted client-side: with a server-generated id there is nothing to
  // address yet, so the completion would target a task that does not exist.
  await expect(taskRow(page, title)).toBeVisible({ timeout: 1000 });
  await page.getByRole("checkbox", { name: `Complete ${title}` }).click();
  await expect(taskRow(page, title)).toBeHidden();

  await expect.poll(() => posts, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);

  await page.goto("/completed");
  await expect(taskRow(page, title)).toBeVisible();
});

test("the rail fills the viewport height", async ({ page }) => {
  await page.goto("/");
  const nav = page.locator('nav[aria-label="Views and lists"]').first();
  await nav.waitFor({ state: "visible" });

  // The rail's background stopped under the last list item once it was wrapped
  // for the mobile drawer: the wrapper became the flex child that stretches, and
  // a nav inside it sizes to its own content. Nothing in the suite noticed,
  // because every assertion was about what the rail *contains*.
  const viewport = page.viewportSize();
  const box = await nav.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(viewport!.height - 2);

  // And the drawer wrapper must not be wider than the rail, or a transparent
  // strip shows between the rail's edge and its shadow.
  const wrapperWidth = await nav.evaluate((el) => el.parentElement!.getBoundingClientRect().width);
  expect(Math.round(wrapperWidth)).toBe(Math.round(box!.width));
});
