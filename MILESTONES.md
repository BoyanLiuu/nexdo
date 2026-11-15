# Nexdo — milestones

_Focus on what's next._

Progress tracker for the build: what has actually landed, and the decisions made along the way.

**Last verified:** 2026-11-15 — M0–M3 complete. `pnpm check` runs 52 unit tests under four time
zones; `pnpm test:e2e` runs 26 across Chromium and WebKit (7 desktop-only).

|     | Milestone                                     | Status  |
| --- | --------------------------------------------- | ------- |
| M0  | Scaffold and the Today screen (fixtures)      | ✅ done |
| M1  | Database, principal, optimistic mutation path | ✅ done |
| M2  | Natural-language capture                      | ✅ done |
| M3  | Dates and views                               | ✅ done |
| M4  | Lists, labels, detail, ordering, search       | ☐       |
| M5  | Recurrence                                    | ☐       |
| M6  | Keyboard, a11y, motion, polish                | ☐       |
| M7  | Clerk, claim, capability gating               | ☐       |
| M8  | Deploy                                        | ☐       |

---

## M0 — Scaffold and the Today screen ✅

- [x] `create-next-app` with pnpm, TypeScript strict, Tailwind v4 (CSS-first, no
      `tailwind.config.js`), ESLint + Prettier with `prettier-plugin-tailwindcss`
- [x] shadcn init (`nova` preset, Radix base); Button, Input, Checkbox, Badge, Dialog, Command,
      Popover, Calendar, Select, Textarea, Sonner added
- [x] Lucide icons; Figtree via `next/font/google`, self-hosted at build time
- [x] Vitest (`.mts` config) and Playwright running, desktop + mobile projects
- [x] `src/lib/fixtures.ts` — read-only sample data with a deliberate spread
- [x] Layout shell: rail with views and lists, main pane, sticky header + capture
- [x] Task row styled: tick, title, due date, list dot, labels, priority flag
- [x] Today view with Overdue and Today groups and per-group counts
- [x] Empty state written to read as success
- [x] Mobile layout: single column, topbar, rail hidden
- [x] `@next/bundle-analyzer` wired (`pnpm analyze`); baseline recorded below
- [x] No Prisma, no Supabase, no localStorage, no store, no `useEffect`

**Bundle baseline** (`pnpm build`, 2026-11-14):

| Measure               | Gzipped      |
| --------------------- | ------------ |
| First-load JS for `/` | **128.7 KB** |
| All client chunks     | 175.3 KB     |
| Budget                | 200 KB       |

M0 ships **zero client components**, so 128.7 KB is the React + Next runtime floor. That leaves
roughly 70 KB of headroom for the app's own client code — worth remembering when `chrono-node`
arrives in M2 (dynamically imported) and `dnd-kit` in M4.

### Decisions log

- **`export const instant = false` on `/`.** Next 16's `cacheComponents` refuses to prerender a route
  that reads the clock, which is correct — Today is wrong by the next midnight. M3 replaces this with
  a Suspense boundary per section so the static chrome can prerender and only counts and rows stream.
- **Rail rows are inert, not links.** `/upcoming`, `/inbox`, `/completed`, `/list/[id]` and
  `/label/[id]` arrive in M3–M4. Rendering them as `<Link>` made `partialPrefetching` fetch twelve
  404s on first paint. Each becomes a link in the milestone that adds its route.
- **No `.dark` block in `globals.css`.** The design is light-only — zero dark-mode references in the
  prototype or `DESIGN.md`. M6's "toggle theme" needs a dark palette designed first.
- **Palette in hex, not oklch.** shadcn's semantic slots are mapped onto the Nexdo tokens so its
  primitives inherit the design; hex keeps values diffable against the prototype.
- **Provisional `lib/dates.ts`.** Reads the machine's local zone. M3 replaces it with zone-aware
  versions taking the owner's IANA zone, because the server renders these views.

### Deferred from the design, deliberately

- **Mobile capture is sticky-top, not fixed above the keyboard.** The prototype pins it to the bottom
  on mobile; the plan assigns "capture pinned above the keyboard" to M6 along with
  `env(safe-area-inset-bottom)` handling.
- **The Today subtitle shows the long date only.** The design also shows local time, the zone name,
  and a note when UTC has already rolled over. All three need the owner's zone rather than the
  server's clock, so they arrive in M3.
- **Nothing from the prototype's sync UI.** No "Synced · 3 min ago" footer, no offline banner, no
  pending counts — none exist in this architecture. M7 puts the account affordance in that rail slot.

---

## M1 — Database, principal, optimistic mutation path ✅

- [x] Supabase dev project; both connection strings in `.env`, `.env.example` committed
- [x] `prisma/schema.prisma` — Owner, List, Label, Task, TaskLabel with snake_case mapping, cascades
      and indexes; `20261115065934_init` applied
- [x] RLS enabled on all five tables with no policies, as a committed migration
      (`20261115070010_enable_rls`) so M8 gets the same treatment
- [x] `src/lib/server/prisma.ts` — single client, pg driver adapter, dev-reload singleton
- [x] `getPrincipal()` — `React.cache()`'d, resolves a guest by `sha256(cookie)`, returns
      `user | guest | none` with the owner's time zone attached
- [x] Guest minted on the **first mutation** only: 128-bit token, `httpOnly`/`SameSite=Lax`, hash
      stored, time zone taken from the browser
- [x] `assertCan()` called in every action with an empty denial list, ready for M7
- [x] `task-service.ts` — every function takes the principal first and filters on `ownerId`
- [x] `actions/task.ts` — parse, resolve principal, `assertCan`, service, `revalidatePath`
- [x] Today reads the database; `kind: "none"` renders the empty state with zero queries
- [x] Capture: Enter adds, box clears and keeps focus, multi-line paste makes several tasks
- [x] Row: checkbox, inline rename, delete, all behind `useOptimistic` + `useTransition`
- [x] Complete shows a 5-second undo toast; undo calls `uncompleteTask`
- [x] Fixtures moved to `src/test/fixtures.ts` as shared test data

**Verified by hand:** fresh incognito, zero rows. One page view wrote nothing. Adding a task created
exactly one `Owner` (kind `GUEST`, zone `America/Los_Angeles` read from the browser, token stored as
64 hex chars) and one `Task` dated today _in that zone_. Complete, undo and reload all round-tripped.
RLS confirmed `relrowsecurity=true`, `forced=false`, with the connecting role both owning the tables
and holding `rolbypassrls` — so PostgREST reads nothing while Prisma is unaffected.

### Decisions log

- **`useOptimistic` lives in `today-list.tsx`, not in the row.** Completing a task removes it from
  Today, and a row cannot remove itself from its parent's array. Anything that changes _which_ rows
  show has to be applied where the list is owned.
- **Capture on Today dates the task today**, as Todoist does. An undated task belongs to Inbox, so
  capturing from Today would otherwise drop it somewhere the user is not looking — and M1's own check
  could not be run from this screen.
- **Actions return `ActionResult`, they do not throw.** A thrown Server Action gives the client a
  generic message in production. More importantly, see the next item.
- **`attempt()` distinguishes four outcomes, including "slow".** A Server Action whose request never
  settles keeps the surrounding transition open, so `useOptimistic` never rolls back and the UI shows
  a change whose fate is unknown. Resolving after 8s ends the transition and the row reverts. The
  message says "still saving", **not** "could not save": stopping the dev server mid-click and
  watching the write land minutes later once it restarted proved the request was queued, not dropped.
  Claiming failure there would be as wrong as claiming success.
- **Success is announced only after the write lands.** The undo toast used to fire immediately, which
  told the user their work was saved before anything had been written.
- **The guest cookie's `Secure` flag comes from the request, not `NODE_ENV`.** `next start` runs in
  production mode over plain http locally, and Safari silently refuses to store a Secure cookie on an
  insecure origin — the guest was lost on every reload in WebKit while Chromium, which exempts
  localhost, passed. Found by the mobile e2e project; it would also have broken any http deployment.
- **`await connection()` is required on `/`.** Reading cookies already makes the route dynamic, but
  Next still evaluates it in a prerender pass and rejects the `new Date()` inside `todayIn()`. The
  e2e suite caught this; manual browser testing had not.
- **`todayIn(zone)` arrived in M1 rather than M3.** The principal already carries the owner's zone, so
  computing "today" from the server's clock would have been deliberately writing the bug M3 exists to
  prevent.
- **Position keys are `Date.now().toString(36)`** — monotonic and sortable, enough to append. M4
  replaces this with fractional indexing so a drag writes one row.

### Known gaps

- E2E tests run against the dev database and leave one guest owner per run. That is exactly what M8's
  prune cron deletes, so it is bounded rather than growing forever — but a separate test database
  would be cleaner.
- `DATABASE_URL` points at the session pooler (5432), not the transaction pooler (6543), because 6543
  is blocked on this network. M8 must switch it.

## M2 — Natural-language capture ✅

- [x] `lib/parse.ts` — `chrono-node` for dates and times, own regex for `p1`/`p2`/`p3`
- [x] Parsing runs client-side, so chips update as you type with no round trip
- [x] `chrono-node` imported dynamically on the first keystroke; priority parsing works without it,
      so the first character is never dead while it loads
- [x] Removable chips before save; the raw text stays editable and dismissing one returns its token
      to the title
- [x] Title has consumed tokens cut out by span, not string-replaced
- [x] Multi-line paste parses each line independently; chips preview the first line only
- [x] `N` focuses capture from anywhere, unless a field already has focus
- [x] `aria-live` announcement of what will be saved, since chips are the only signal the text was
      interpreted rather than taken literally
- [x] 24 parser unit tests plus 5 e2e

**Bundle:** first-load JS **129.4 KB** gzipped, up 0.7 KB from M1 against a 200 KB budget. `chrono`
ships in its own chunks and is verifiably absent from the initial payload.

### Decisions log

- **Matches carry spans, not just values.** The title is built by cutting accepted spans out of the
  original text, which is what lets a dismissed chip return its token — a task genuinely named
  "P1 rollout" keeps its name. String-replacing the matched words would mangle it.
- **Date and time are decided independently, and either can be absent.** chrono reports a full
  timestamp for almost anything, so both go through a certainty gate:
  - A **time** needs `meridiem` certain. chrono reports it for "5pm", "9:30am" and "17:00" but not
    for a bare "at 5" — which is what stops "meet at 5 guys" becoming a 5 pm task.
  - A **date** needs one of `weekday`/`day`/`month`/`year` certain. Without this, "at 5" offered a
    "Today" chip, claiming an intent the user never had.
  - Neither certain means the match is dropped entirely and the title is left whole.
  - A time with no date leaves `dueDate` null, so "call mum 7pm" is today at 7 via the view's default
    rather than a date invented in the parser.
- **Read chrono's date _components_, never `.date()` then `toISOString()`.** That round trip shifts
  into UTC — "tomorrow 5pm" became the following day. Components are already in the parser's local
  zone, which client-side is the user's own. There is a regression test for exactly this.
- **Chips sort by position in the text**, not by which scanner ran first, so they read left to right
  as typed.
- **Chip ids are `kind:matchedText`**, not span-based: spans shift when you edit earlier in the line,
  which would make a dismissal jump to a different token.
- **The create action takes an array of parsed tasks.** One line and a pasted block then follow the
  same path, and the server validates each with the same schema.

### From the review pass

- **Deleted parse.ts's private date formatters** in favour of `dates.ts`. They were near-duplicates,
  and the local copy carried a real bug: it compared a locally-constructed `Date` against
  `new Date("YYYY-MM-DD")`, which JS parses as **UTC midnight**. At UTC+13/+14 the day difference came
  out one short, so tomorrow's chip read "16 Nov" instead of "Tomorrow". Confirmed in
  `Pacific/Apia` and `Pacific/Kiritimati` before fixing. One formatter now, building both sides the
  same way.
- **`chrono` is loaded from the change handler, not an effect.** An effect keyed on `value` re-ran on
  every keystroke only to hit its own guard. Typing is an interaction, not derived state.
- Removed `nextPosition()`, orphaned when the two create functions became one, and a redundant
  `PRIORITY.lastIndex` reset (`matchAll` does not advance the source regex).

### Known gap this milestone opens

Parsing a future date now creates tasks that **leave the only view that exists**. Type "pay rent
friday" on Today and the task is saved correctly and then invisible, because Upcoming arrives in M3.
There is an e2e test asserting this so it is recorded as a known state rather than found as a bug.

---

## M3 — Dates and views ✅

- [x] `lib/dates.ts` rebuilt: `todayIn(zone)` is the only function that reads a clock, and it demands a
      zone. Everything else takes `YYYY-MM-DD` strings and is zone-independent by construction
- [x] Arithmetic goes through `Date.UTC`, so day differences are exact integers, immune to DST, and
      cannot mix a local-midnight `Date` with a UTC-parsed one
- [x] `isOverdue`/`isToday`/`formatDue` lost their default `from` argument — a default let callers
      silently fall back to the machine's zone, which is the bug the module exists to prevent
- [x] Four views: Today (Overdue + Today), Upcoming (7 days, empty days kept), Inbox, Completed
- [x] Per-view counts in the rail, and a bespoke empty state per view
- [x] Sort by manual order, due date or priority, applied by the query and held in the URL
- [x] Rail view rows are real `<Link>`s with `aria-current`, now that their routes exist
- [x] One Suspense boundary for the rail and one for the body, so the shell prerenders — all four
      routes build as `◐` and `instant = false` is gone
- [x] 77 unit tests, run under Pacific/Midway, LA, UTC and Pacific/Kiritimati via `pnpm test:tz`

### Decisions log

- **The module's shape is the safeguard.** One clock-reading function that requires a zone; everything
  else pure string arithmetic. I had already reintroduced the local/UTC mixing bug twice by accident —
  once reading chrono through `toISOString()`, once in a copy-pasted formatter that broke at UTC+14 —
  so M3 makes it structurally hard rather than relying on care.
- **Sort lives in the URL, not component state.** The ordering is applied by the database, so the
  server has to know it; a search param survives reload, can be linked, and needs no client store to
  stay in step with the RSC payload.
- **`searchParams` is awaited inside the Suspense boundary, not in the route.** Reading it in the route
  body makes Next abandon prerendering the whole page, which costs the shell its instant paint.
- **Upcoming keeps empty days.** The week's shape is information — a free Thursday is worth seeing.

### Bugs this milestone found

- **`revalidatePath("/")` only invalidated Today.** Add a task dated Friday, click Upcoming, and it was
  missing until a hard reload. Every task mutation can change all four views and all four rail counts,
  so actions now revalidate the whole tree under the root layout. Manual testing had missed it because
  restarting the server cleared the cache.
- **The Upcoming query was a day short of its own layout** — `lte addDays(today, UPCOMING_DAYS - 1)`
  fetched six days while `groupByDay` laid out seven, so the last heading could never show anything.
- **Capture could submit before the parser loaded.** Typing "pay rent friday" and pressing Enter inside
  chrono's import window silently dropped the date and filed the task under today. Submit now waits for
  the parser — but only for 2 seconds, because a slow or failed chunk fetch must never block saving.
  The first version of that fix had no deadline and hung the submit on WebKit.

### Hardening added after review

- **A `beforeunload` guard while a write is in flight** (`lib/use-pending-write.ts`). Optimistic UI
  reports success before the server confirms, so closing the tab inside that window cancels the
  request — the task stays open in the database while the user watched it complete. Short window,
  real loss, and it surfaces as "the app lost my task" with no reproduction. Wired into both places
  that mutate.
- **An e2e database guard** (`tests/guard-database.ts`, run as Playwright's `globalSetup`). The suite
  writes, and the only thing between the dev project and production was whatever `DATABASE_URL`
  happened to say — which gets tempting to repoint around deploy. It refuses to run if any `USER`
  owner exists, since a dev database has only guests. Verified by inserting a fake account and
  watching it refuse. `E2E_ALLOW_REAL_ACCOUNTS=1` overrides, deliberately.

### Test audit

77 unit tests became **52** with no loss of coverage. The `dates` suite looped the same assertions
over five zone names while **changing nothing between iterations** — 24 identical tests that read as
zone coverage and provided none. Real zone variation comes from `pnpm test:tz`, which starts the
process under four `TZ` values. Also merged two `describe` blocks covering the same condition and
renamed two tests whose names claimed "everywhere" after the loop was gone.

### Known gaps

- **E2E flakiness was the test helper, not the app.** Waiting on the Server Action's POST is only
  needed where optimistic UI hides the write. For a create there is no optimistic insert, so the row
  appearing already proves the server wrote it — the extra response wait was redundant, and on mobile
  WebKit it was the whole flake. `mutate()` is now used only in the desktop-only cross-route checks.
  Seven consecutive runs: six clean, one retried flake, down from a flake in every run.

  A rare flake may remain and is not identified; it did not recur in four further runs. Treat a
  `flaky` line as a finding rather than noise — `trace: "on-first-retry"` leaves a trace to open.

- Four cross-route write tests are desktop-only. The behaviour is not mobile-specific, and several
  parallel WebKit contexts on one machine made them flake on timing; mobile keeps rendering and
  parsing coverage, where its layout and input model genuinely differ. E2E has one local retry.
- E2E still leaves one guest owner per run. 98 had accumulated before this milestone and were cleared
  by hand. M8's prune cron is the real answer; a separate test database would be cleaner.
- The Today subtitle still shows only the long date. The design also shows local time, the zone name
  and a note when UTC has rolled over — all of which need a live clock, so they are client-side work.

---

## Conventions

- `pnpm check` = typecheck + lint + format check + unit tests. Green before every milestone commit.
- `pnpm test:e2e` runs Chromium and WebKit; WebKit matters because the brief requires iOS Safari.
- Dev binds `127.0.0.1:3033`; Playwright builds and serves on `127.0.0.1:3133`.
- `pnpm dev:utc` runs the server in UTC while the browser reports its real zone — the only way to
  reproduce the production time-zone mismatch locally before M8.
- `pnpm` is not on PATH in this environment; use `corepack pnpm`, or a shim on PATH for tools that
  spawn `pnpm` directly (`create-next-app` does).
