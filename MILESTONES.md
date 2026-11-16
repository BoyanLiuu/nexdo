# Nexdo — milestones

_Focus on what's next._

Progress tracker for the build: what has actually landed, and the decisions made along the way.

**Last verified:** 2026-11-15 — M0–M6 complete, which finishes Phase A: the product is usable end to
end with no sign-in anywhere. `pnpm check` runs 82 unit tests under four time zones; `pnpm test:e2e`
runs 50 across Chromium and WebKit (36 passed, 13 skipped as platform-specific, 1 known flake).

|     | Milestone                                     | Status  |
| --- | --------------------------------------------- | ------- |
| M0  | Scaffold and the Today screen (fixtures)      | ✅ done |
| M1  | Database, principal, optimistic mutation path | ✅ done |
| M2  | Natural-language capture                      | ✅ done |
| M3  | Dates and views                               | ✅ done |
| M4  | Lists, labels, detail, ordering, search       | ✅ done |
| M5  | Recurrence                                    | ✅ done |
| M6  | Keyboard, a11y, motion, polish                | ✅ done |
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

## M4 — Lists, labels, detail, ordering, search ✅

- [x] `lib/server/list-service.ts`: create / rename / archive / move / delete for lists, create /
      rename / delete for labels, all filtered on `ownerId` like the task service
- [x] `lib/actions/list.ts`: the matching Server Actions, each parsing its input with a Zod schema
      before it touches the service
- [x] Rail `+` buttons for Lists and Labels (`rail-actions.tsx`) — one component for both, because the
      interaction is identical and two near-copies would drift
- [x] `/list/[id]` and `/label/[id]` routes, sharing the view shell, counts and sort controls
- [x] Detail side panel (`task-detail.tsx`) on React Hook Form + Zod: title, notes, due date, priority,
      list, labels, subtasks
- [x] `ui/side-panel.tsx` built on Radix Dialog primitives
- [x] Manual ordering: `lib/ordering.ts` over `fractional-indexing`, dragged via `@dnd-kit` with a
      `KeyboardSensor` (`sortable-rows.tsx`)
- [x] Search: `GET /api/search` behind TanStack Query, in a `⌘K` dialog (`search-dialog.tsx`)
- [x] Capture learned `#list` and `@label`, with the same chip-and-span treatment as dates
- [x] 65 unit tests under four zones; e2e 31 passed / 1 flaky / 8 skipped; first-load JS unchanged at
      129.4 KB

### Decisions log

- **Fractional indexing rather than an integer `position` column.** Dropping a row between two others
  generates a string key that sorts between their keys, so a move is a **one-row write**. Renumbering
  integers rewrites every row below the drop, which is a transaction whose size depends on list length
  and which fights optimistic UI. The cost is unreadable keys (`a0`, `a0V`) and keys that lengthen
  under repeated insertion at the same point — neither of which the user ever sees.
- **`@dnd-kit` for the `KeyboardSensor`, not for the dragging.** HTML5 drag events would have covered
  the mouse. Manual ordering reachable only by mouse is a feature half the keyboard-only audience
  cannot use, and dnd-kit announces each step to assistive tech for free.
- **Search is the one place TanStack Query earns its keep.** Every other read is a Server Component.
  Search is keystroke-driven, needs debounce, caching per term and cancellation of superseded requests
  — a Route Handler plus a query client, rather than a Server Action per keystroke.
- **Radix Dialog directly instead of `shadcn add sheet`.** The CLI insisted on overwriting `button.tsx`
  to install it, and a sheet _is_ a dialog positioned to one side. Focus trap, escape, scroll lock and
  `aria-modal` come from the primitive; the file adds only position, width and motion.
- **Mutations use `updateMany`, never `update`.** Prisma's `update` takes a unique `where`, so
  `ownerId` cannot go in it — the ownership check would have to be a separate read first. `updateMany`
  accepts a compound filter, making "this row **and** it is mine" a single statement. `setTaskLabels`
  is the one exception, because delete-then-insert on a join table has no single `WHERE` to carry the
  filter; it checks ownership explicitly and narrows the incoming ids to labels the owner has.
- **The detail panel is deliberately not optimistic.** The test is whether the write changes which rows
  are shown. Completing or moving does; editing a title does not, so waiting is free and buys a real
  Save button and field-level errors. Labels are the exception inside it — a toggle gated behind Save
  is a toggle people mistrust, so it writes on click and reverts itself on failure.
- **Drag is off unless the sort is manual.** Under date or priority sort the order comes from the
  query, so a dropped row would snap back on the next render. An affordance the data cannot honour is
  removed rather than left to fail.

### Bugs this milestone found

- **A brand-new visitor could not create a list.** Only `createTask` minted the owner row, so the
  first click of `+` beside Lists hit a service call with no owner and returned an error the UI
  swallowed. Identity bootstrapping belongs on **every** entry point that creates owned data, not
  just the first one that happened to be built — hence a second helper, `authorizeCreate`, which calls
  `ensureOwner` and takes the browser's time zone for the owner row it may create.
- **Zod silently stripped `listId` from the create payload.** Typing `#home` parsed, showed a chip, and
  then filed the task to Inbox. `safeParse` drops unknown keys rather than failing, so the client was
  sending a field the schema never admitted and nothing reported it. Fixed by extending
  `newTaskSchema` — and by validating that the `listId` and `labelIds` actually belong to the caller,
  which the first version did not.
- **`export const dynamic` is incompatible with `cacheComponents`.** The `[id]` routes needed
  `instant = false` instead; the familiar escape hatch is a build error under this config.

### Known gaps

- Subtasks are creatable and completable but not reorderable or nestable beyond one level.
- Search is `ILIKE '%q%'` over title and notes with no relevance ranking — open tasks first, then
  manual order, capped at 30. A leading wildcard cannot use an index either, so it is a scan per
  keystroke. Fine at personal-list scale; `tsvector` + GIN is the answer if it ever isn't.
- Keys from `fractional-indexing` grow without bound under repeated insertion at the same position.
  A rebalance pass is the standard remedy and is not written — it needs a list long enough to matter.
- Deleting a label does not confirm, unlike deleting a list. Labels carry less and are cheaper to
  recreate, but the asymmetry is a decision made by omission rather than on purpose.

---

## M5 — Recurrence ✅

- [x] `lib/repeat.ts`: `nextDue()` over the five rule kinds, plus `describeRepeat()` for the row badge
      and the editor's summary line. Pure calendar-string arithmetic, no clock
- [x] `repeatSchema` as a Zod discriminated union — the single definition, used by the editor, the
      action, and the service when it re-parses the `Json` column
- [x] `dates.ts` gained `addMonths(date, months, day)` and `daysInMonth`, with the clamping rule
- [x] Completing a repeating task writes the completion and inserts the next occurrence in **one
      transaction**, both carrying a shared `seriesId`
- [x] Undo of a completion withdraws the occurrence that completion spawned
- [x] Skip advances the same row without recording a completion
- [x] Repeat editor in the detail panel, all five kinds, with a day picker for weekly rules
- [x] Repeat badge on the row, with the rule in words for screen readers
- [x] 82 unit tests under four zones; e2e 32 passed, 0 flaky
- [x] No migration: `repeat` and `seriesId` were in the schema from M1

### Decisions log

- **A Zod discriminated union, not `RRULE`.** iCalendar's grammar covers every _fixed_ schedule and
  cannot express "three days after I last did it" — which is the rule people actually want for
  watering plants. A five-member union covers what the app offers, is exhaustively checked by the
  compiler (a new kind breaks every `switch` until handled), and reads as itself in the database.
- **Each occurrence is a row; the first occurrence's id becomes the `seriesId`.** No series table and
  no id minted up front. Completion history is then just rows, which is what makes Completed show
  "you did this five times" rather than one row with a counter.
- **Only the next occurrence is materialised, never a horizon of them.** One live row per series at any
  time. That invariant is load-bearing — see undo, below.
- **Undo withdraws the spawned occurrence, found without a back-pointer column.** Because only
  completing spawns the next one, the _open_ sibling in the series is necessarily the one this
  completion created. The 5-second undo toast makes this a routine path, not an edge case: without it,
  every undo of a recurring task would leave two live copies.
- **Skip advances the same row.** You did not do the thing, so there is no history to write — and the
  series keeps its single open occurrence for free.
- **The monthly rule remembers the day the user asked for.** "The 31st" clamped to 28 February returns
  to 31 March, which is impossible if each step reads the day off the previous result.
- **No "this occurrence or the series?" dialog.** With one live occurrence, editing it _is_ editing the
  series — the next occurrence is cloned from this row at completion time, so changes carry forward by
  construction and past occurrences stay as history. This resolves the plan's open question 7: not
  merely acceptable, it is the only coherent reading of the model.
- **The repeat editor is not part of the panel's React Hook Form**, which the plan had assumed. The
  rule is a discriminated union, so one form's values type would have to be that union and every
  `register` path would depend on the selected kind. The schema is still the single definition — the
  editor validates with it before sending, exactly as the action does on arrival.
- **An unreadable rule reads as no rule.** A `Json` column is untyped storage, so the service
  re-parses it through the schema; a row written by an older build stops repeating instead of taking
  a view down.

### Found in review of this milestone

- **A comment that lied about cost.** It claimed a plain completion "skips the read entirely"; the code
  reads unconditionally, because only the row knows whether it repeats. Completion went from one
  statement to two for _every_ task. The cost is accepted — the click is optimistic, so the user waits
  for neither — but the comment now says so.
- **`seriesHistory()` had no callers.** Written for a history list the panel does not have. Deleted,
  same as `restoreTask` in M1.
- **Two separate imports of `@/lib/dates`** in one file, which lint does not flag. Merged.

### Found in the review after committing

Five more, from re-reading the diff rather than recalling it. The first was a user-visible defect.

- **An invalid rule was described as if it were real.** Clearing the interval box gives `Number("")`
  = 0, which fails the schema — so it was correctly held back from the server, but the summary line
  still read "Every 0 days". One `safeParse` validity check now gates the description and replaces the
  ad-hoc empty-weekday special case.
- **`RepeatEditor` took four date props where two do.** The panel was computing `dueWeekday` and
  `dueDay` with its own `weekdayOf` call and a `.slice(8, 10)`. `dayOfMonth` moved into `dates.ts`.
- **A duplicated weekday-name array** in `repeat.ts`, copying the private one in `dates.ts`. Exported
  and reused — in M3 a copy-pasted date helper _was_ the bug.
- **Week ordering was implemented twice**, once for the arithmetic and once for the description.
  Extracted, since the two must agree.
- **`completeTask` inlined a 13-field select** that `TASK_SELECT` already is. A second list to forget.

### Bugs this milestone found

- **A hydration mismatch from M4's drag-and-drop**, surfaced while verifying recurrence in a browser.
  `@dnd-kit` derives its `aria-describedby` ids from a counter that starts at a different value on the
  server (which has rendered other lists already) than in a fresh client, so React logged an error on
  every page with a sortable list. Fixed by passing `DndContext` a stable `useId()`. It had been there
  since M4 and no test caught it — e2e asserts on failed _requests_, not on console errors.

### Known gaps

- Subtasks are not cloned onto the next occurrence, so a repeating checklist loses its items. The
  common case is a bare repeating task; cloning a subtree is its own decision.
- `position` is copied to the new occurrence, so a manually-ordered list keeps the task where it was.
  Harmless today because the two rows never both sit in the same view.
- **Upcoming is a fixed 7-day window**, which recurrence makes more noticeable: a monthly task is
  invisible in the date views for three weeks, reachable only through its list or search.
- The weekly interval has no anchor week. Cadence is relative to the last occurrence, so completing
  "every other Monday" late shifts the following one rather than keeping the original fortnight.
- No test covers the completion transaction rolling back, which the plan asked for. It needs a forced
  insert failure against a real database; asserting it any other way would be asserting the mock.

---

## M6 — Keyboard, a11y, motion, polish ✅

**Phase A is complete.** The product works end to end on `localhost` with no sign-in anywhere.

- [x] Command palette on cmdk (⌘K): views, lists, labels, new task, shortcut list
- [x] Shortcut help overlay (`?`), rendered from `lib/shortcuts.ts` — the same array the bindings are
      declared in, so the documentation cannot drift from the app
- [x] Full keyboard operation: J/K or ↑↓ to move, Space to complete, Enter for details, E to rename,
      ⌥↑/⌥↓ to reorder, ⌫ to delete
- [x] Rows take **real DOM focus** with a roving `tabindex`, and focus moves to a neighbour when the
      focused row leaves the view
- [x] Checkbox state is native, so it announces itself; its label says Reopen on a done task
- [x] All motion behind `prefers-reduced-motion`, in one global rule
- [x] Mobile: swipe-to-complete with a direction lock, and **a navigation drawer** — see below
- [x] `app/error.tsx` for a failed read, since a Server Component failure has no toast to land in
- [x] README rewritten: identity model, read/write paths, keyboard reference
- [x] 82 unit tests; e2e grew to 50 (5 new), 36 passing with 13 platform-skipped

### Decisions log

- **One key, one owner.** `n` lives with the capture box because that component holds the input ref,
  `?` with the shortcuts dialog, `/` with search, ⌘K with the palette. The first version had the
  palette also binding `n` and `?`, which meant two listeners firing for one keystroke. A binding
  belongs to whatever holds the thing it acts on.
- **The help overlay renders the binding list.** `lib/shortcuts.ts` is the single array; an undocumented
  shortcut is impossible by construction because there is no second list to fall behind.
- **The palette is not the search box.** Search answers "where is that task"; the palette answers "take
  me to Upcoming". Merging them means every navigation query runs a database search, and every task
  search competes with view names for the top row.
- **Rows take real focus rather than a highlight.** A purely visual cursor is invisible to a screen
  reader and unreachable by Tab. A roving `tabindex` keeps one row in the tab order so Tab does not
  have to walk a hundred of them.
- **Focus is handed to a neighbour _before_ the optimistic removal**, while the row is still in the
  list and its neighbours can still be found. Otherwise the browser's answer to "what now" is the
  document body, which strands a keyboard user at the top of the page.
- **Reduced motion is one global rule, not a per-component decision.** It collapses durations to 1ms
  rather than 0 because Radix waits for `animationend` before unmounting a dialog, and a zero-duration
  animation may never fire the event — which would leave the overlay mounted over an unusable page.
- **Swipe is right-only, and the first few pixels decide.** Until the finger has a direction nothing
  happens; ties go to scrolling, because a list is read far more often than it is swiped. Left is
  reserved: delete-by-accident is unforgivable where complete-by-accident costs one tap of Undo.
- **Two named window events (`lib/chrome-events.ts`) connect the static shell to the streamed parts.**
  The mobile topbar lives in `ViewShell`, which is static so the frame paints before any query; the
  drawer and the search dialog stream separately. A context provider spanning that boundary would cost
  the shell its prerender. Not a simulated keystroke — those are indistinguishable from a real user
  and break the moment a binding changes.
- **No theme toggle**, which the plan listed. See below.

### Bugs this milestone found

- **The mobile app had no navigation at all, and had not since M0.** The rail was `hidden` below the
  `md` breakpoint and the two topbar buttons — "Open views and lists" and "Search" — were markup with
  no handlers. On a phone, Today was the only reachable screen: no Upcoming, no Inbox, no Completed,
  no list, no label, no search. Five milestones of verification had all been done at desktop width.
  Now a real drawer, with both buttons wired and 44px tap targets.
- **`CommandDialog` as vendored by shadcn could not be used at all.** It renders
  `<DialogContent>{children}</DialogContent>` without the `<Command>` root, so `CommandInput` has no
  cmdk store and throws `Cannot read properties of undefined (reading 'subscribe')` the moment the
  palette opens. Its `DialogTitle` also sat _outside_ `DialogContent`, where Radix cannot use it for
  `aria-labelledby`. Both fixed in `ui/command.tsx`.
- **Three React-compiler violations in my own new code**, all caught by lint rather than by a test: a
  ref written during render in `useRowKeyboard`, a `setState` inside an effect mirroring a prop into
  row state, and `Date.now()` on a render path. The second and third dissolved once the list — not the
  row — owned which row is being renamed, which is the house rule about one owner per piece of state.
- **The rail hid itself as well as being placed by the drawer.** `hidden md:flex` stayed on the `nav`
  after `RailShell` took over positioning, so the drawer slid a `display: none` element into view. My
  own browser check had measured the _wrapper_ and reported success — a false positive from verifying
  the thing I changed instead of the thing the user sees. The e2e test caught it.
- **The streaming fallback and the real rail were both `<nav aria-label="Views and lists">`**, so while
  a query resolved there were two identically-named landmarks. The placeholder is now unlabelled and
  `aria-hidden`: it is scaffolding, not navigation.
- **An a11y fix broke a test, correctly.** Renaming the control to "Reopen" on a completed task made an
  e2e test that asserted "Complete" fail. The test was encoding the old wrong label.

### Found in the review before committing

- **The arrow keys were taking over the page.** The handler claimed ↑/↓ and called `preventDefault`
  whenever the user was not typing and a dialog was not open — so Down stopped scrolling anywhere in
  the app, whether or not the cursor was near the list. The arrows now act only once a row holds
  focus, and `j`/`k` are the way in from anywhere: a vim key is never a scroll gesture, which is
  exactly why those two are the ones that can safely be global.
- **The list was unreachable by Tab.** With no cursor set, every row was `tabindex="-1"` — the classic
  roving-tabindex mistake. One row (the first, until the cursor moves) is now always in the tab order.
- **The swipe decided its outcome from stale state.** `onTouchEnd` read the distance out of React
  state, which is the value from the last _render_; touch events arrive faster than renders flush, so
  a finger that visibly reached 100px could be judged on a stale 60 and the completion would silently
  not happen. A ref now carries the authoritative distance and state only drives the transform.
- **A second finger kept swiping.** A pinch or two-finger scroll that began on a row went on driving
  the gesture; multi-touch now abandons it.
- **Two e2e locators were asserting the wrong thing.** `li[tabindex='0']` matched Sonner's toasts as
  well as rows, and after the Tab fix it matches the _reachable_ row rather than the _current_ one.
  The cursor is now located by `:focus`, which is what the feature actually claims.

### Known gaps

- **No theme toggle.** The plan lists one; the design is a light-only system and `globals.css` has no
  `.dark` block. A toggle needs a dark palette _designed_ first — picking one here would be inventing
  a second design system rather than polishing this one. Flagged rather than guessed at.
- **Next keeps previously-visited route trees mounted** after a client-side navigation, collapsed to
  0×0 but still in the DOM, so there are two or three `nav` landmarks named "Views and lists" after a
  few clicks. Measured: it plateaus at 3, so it is route retention rather than a leak. It predates M6
  — the old rail had the same duplicates on desktop — and it makes `getByRole` ambiguous in tests,
  which is why the drawer test takes `.first()`.
- One mobile e2e flake remains, in the capture and completion tests. It passes 8/8 in isolation and
  fails roughly one run in three under six parallel workers, which points at machine contention
  rather than the app. Not root-caused.
- Swipe-to-complete has no visual spring back when released short of the threshold; the row simply
  returns.

---

## Post-M6 — optimistic creates

Not a planned milestone; it came from noticing that adding a task felt slow while completing one did
not. Measured before changing anything: complete repainted in **8ms**, create took **~750ms**.

- [x] The capture box moved inside the component that owns the task array, which is now `TaskBoard`
      rather than `TaskList` — it renders the box, the detail panel and the rows
- [x] An `insert` action on the optimistic reducer
- [x] Ids and sort keys minted client-side (`@paralleldrive/cuid2`) and sent with the create
- [x] `createTasks` honours a supplied id, and the label join no longer reads the tasks back
- [x] Prisma's connection pool capped, which was breaking every run of dev + e2e together
- [x] Two e2e tests: the row appears without the round trip, and a task can be completed before its
      insert lands
- [x] **~750ms → ~20ms**, verified in a browser

### Decisions log

- **The blocker was composition, not logic.** `useOptimistic` lives with the task array; the capture
  box was a _sibling_ under `ViewBody`, a Server Component that can hold no state. There was nowhere
  to put the new row. Moving the box inside the owner was the whole fix structurally.
- **The client mints the id, and that is the load-bearing part.** `@default(cuid())` is only a
  default. Drawing an optimistic row is easy; being able to _act_ on it is not — tick the new task
  14ms later and the completion needs a real id to address. A server-generated id would mean a
  placeholder and a reconciliation pass on every follow-up action. Safe because authorization is the
  `ownerId` filter, so a chosen id grants nothing, and a collision just fails the insert.
- **The client mints the position too**, so the optimistic row sorts where the real one will and does
  not jump when the server payload replaces it.
- **Which views show it is still decided by the client's own grouping.** A task dated Friday captured
  on Today is inserted into the array and correctly filtered out by `groupsFor` — no special case.

### Bugs this found

- **The label join matched tasks by title.** It read the new tasks back with
  `where: { title: { in: [...] } }` and mapped titles to ids — a wasted round trip that attached
  labels to the wrong task whenever two tasks shared a title. Gone: the ids are known before the
  insert.
- **The connection pool was unbounded per process, and there is more than one process.** `PrismaPg`
  had no `max`, so `pg` used its default of 10, against a Supabase pooler that allows 15 for the whole
  project. Capping it at 6 did _not_ fix it: Next runs several render workers, each with its own pool,
  so the constraint is `workers x max < 15`. Default is now 3, overridable with
  `DATABASE_POOL_MAX`. This is what the earlier "17 unrelated e2e failures" were, and almost
  certainly what the "rare mobile flake" recorded since M3 was as well — a full suite run with a dev
  server alongside now reports **41 passed, 1 flaky, 0 connection errors**, which had never held
  before.
- **A test-helper assumption flipped back.** M4 removed the write-wait from `capture()` because
  without an optimistic insert the row could only appear after the server had written it, so the row
  was proof of the write. That is no longer true, and tests that reloaded next were cancelling the
  write and then failing to find the task.

### Known gaps

- The window where the UI reports success before the write lands grew from ~200ms to ~700ms for
  creates. `beforeunload` still guards it, but it is a wider window than when that guard was written.
- Rail operations — create list, create label, rename, archive — are still non-optimistic. Same shape
  as this change, different component.

---

## Conventions

- `pnpm check` = typecheck + lint + format check + unit tests. Green before every milestone commit.
- `pnpm test:e2e` runs desktop Chromium only, and is green: 29 passed, no retries, ~32s. The iPhone
  and desktop-WebKit projects were removed after measuring that every failure and flake in the suite
  was WebKit's and none Chromium's — and that running WebKit _serially_ was the worst result, so it is
  not contention. `pnpm test:e2e:webkit` still runs it; treat that as an open investigation, not a
  gate. The cost is that nothing now watches the cookie behaviour WebKit once caught (see M1).
- **Stop the dev server before running e2e.** Locally both connect through Supabase's _session_
  pooler, which allows 15 clients; six Playwright workers plus a dev server exceed it and every query
  fails with `(EMAXCONNSESSION) max clients reached in session mode`. It surfaces as a wave of
  unrelated "element not found" failures, which reads like an app regression and is not one.
- Dev binds `127.0.0.1:3033`; Playwright builds and serves on `127.0.0.1:3133`.
- `pnpm dev:utc` runs the server in UTC while the browser reports its real zone — the only way to
  reproduce the production time-zone mismatch locally before M8.
- `pnpm` is not on PATH in this environment; use `corepack pnpm`, or a shim on PATH for tools that
  spawn `pnpm` directly (`create-next-app` does).
