# Nexdo — milestones

_Focus on what's next._

Progress tracker for the build: what has actually landed, and the decisions made along the way.

**Last verified:** 2026-11-15 — M0 and M1 complete, `pnpm check` (20 unit tests) and
`pnpm test:e2e` (9 tests, Chromium + WebKit) green.

|     | Milestone                                     | Status  |
| --- | --------------------------------------------- | ------- |
| M0  | Scaffold and the Today screen (fixtures)      | ✅ done |
| M1  | Database, principal, optimistic mutation path | ✅ done |
| M2  | Natural-language capture                      | ☐       |
| M3  | Dates and views                               | ☐       |
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

## Conventions

- `pnpm check` = typecheck + lint + format check + unit tests. Green before every milestone commit.
- `pnpm test:e2e` runs Chromium and WebKit; WebKit matters because the brief requires iOS Safari.
- Dev binds `127.0.0.1:3033`; Playwright builds and serves on `127.0.0.1:3133`.
- `pnpm dev:utc` runs the server in UTC while the browser reports its real zone — the only way to
  reproduce the production time-zone mismatch locally before M8.
- `pnpm` is not on PATH in this environment; use `corepack pnpm`, or a shim on PATH for tools that
  spawn `pnpm` directly (`create-next-app` does).
