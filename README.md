# Nexdo

_Focus on what's next._

A personal todo app: type a task in plain words, see what it read before it saves, and keep the day's
work in front of you.

**Progress:** [MILESTONES.md](MILESTONES.md) — what has landed, what is next, and why each decision
was made.

> **Status:** usable end to end without an account. Capture, dates, the four views, lists, labels,
> ordering, search, recurrence, and full keyboard operation are in. Sign-in (M7) and deployment (M8)
> are not — everything runs locally against a real Postgres database.

## What makes it non-trivial

Four things, none of them the task list itself:

- **"Today" is a calendar concept, not a timestamp.** A due date is stored as `YYYY-MM-DD` text, and
  "due today" is computed in the _user's_ time zone. Because the server renders these views, that zone
  has to be data on the user's record rather than whatever `new Date()` returns in the deploy region —
  otherwise every date boundary is wrong for most of the world. One function reads a clock
  (`todayIn(zone)`), it demands a zone, and everything else is pure string arithmetic.
- **You can use it before you sign up.** Identity is a `Principal`, not a user id — see below.
- **Recurrence regenerates rather than repeats.** Completing an occurrence creates the next one, which
  includes rules like "3 days after I last did this". `RRULE` cannot express that, so the rule is a
  small typed union instead. Only one occurrence of a series is ever open at a time, which is what
  makes undo of a completion able to withdraw the occurrence it created.
- **Perceived latency decides whether a todo app gets used.** Anything that changes _which_ rows are
  shown paints optimistically within a frame, and a failure reverts visibly rather than leaving a row
  looking saved.

## Identity: no sign-up required

```
first mutation ──> mint Owner(kind: GUEST) + set httpOnly cookie
                   store only sha256(token); the cookie is the secret

sign in (M7)  ──> same Owner row, flipped to kind: USER
                   one UPDATE; no task row moves
```

Every service function takes a `Principal` and filters every query on its `ownerId`:

```ts
type Principal =
  | { kind: "user"; ownerId; timeZone } // signed in
  | { kind: "guest"; ownerId; timeZone } // cookie + Owner row
  | { kind: "none" }; // nothing written yet
```

A guest and a signed-in user therefore produce the same query — there is no second code path to keep
in step. Two consequences worth knowing:

- **The owner is minted on the first _mutation_, never on a page view.** A cookie cannot be set from a
  Server Component, so the platform enforces this. A crawler that only issues GETs writes nothing.
- **Authorization is the `ownerId` in the `WHERE` clause.** Mutations use `updateMany` rather than
  `update` so the owner can be part of the filter: a guessed id updates zero rows. Row-level security
  is enabled on every table as a backstop, not as the model.

Clearing cookies makes that work unreachable. The app says so plainly rather than implying otherwise.

## Read and write paths

```
READ · Server Component
  request → getPrincipal() (React.cache'd) → today = todayIn(owner.timeZone)
          → taskService.tasksForView(principal, view, today)
          → Prisma, filtered by ownerId → streamed into a Suspense boundary

WRITE · Server Action
  click → useOptimistic applies it to the list immediately
        → action: getPrincipal + Zod parse + capability check
        → taskService mutates (ownerId in the WHERE)
        → revalidatePath("/", "layout") — every view can show the row
        → optimistic state is discarded when the real payload lands
```

Reads are Server Components and writes are Server Actions, so there is no API layer and no client
fetching state. The one exception is search, which hits `GET /api/search` through TanStack Query
because it needs a response per keystroke with caching across them.

`useOptimistic` lives at the **list**, not the row: completing a task removes it from the view, and a
row cannot remove itself from its parent's array.

## Keyboard

The app is operable without a mouse; press <kbd>?</kbd> for the list, which is rendered from the same
array the bindings are defined in (`src/lib/shortcuts.ts`), so it cannot drift.

| Key                         | Does                              |
| --------------------------- | --------------------------------- |
| <kbd>⌘K</kbd>               | Command palette — views and lists |
| <kbd>/</kbd>                | Search titles and notes           |
| <kbd>N</kbd>                | New task                          |
| <kbd>↑</kbd> <kbd>↓</kbd>   | Move between rows                 |
| <kbd>Space</kbd>            | Complete or reopen                |
| <kbd>Enter</kbd>            | Open details                      |
| <kbd>E</kbd>                | Rename in place                   |
| <kbd>⌥↑</kbd> <kbd>⌥↓</kbd> | Reorder, under manual sort        |
| <kbd>⌫</kbd>                | Delete, with undo                 |

Rows take real DOM focus with a roving `tabindex` — exactly one row is in the tab order, so Tab
enters the list in a single stop — and focus moves to the next row when the focused one is completed
rather than falling to the body. The arrows only act once a row holds focus, so <kbd>↓</kbd> still
scrolls the page everywhere else; <kbd>J</kbd>/<kbd>K</kbd> are the way in, because they are never a
scroll gesture. All motion is behind `prefers-reduced-motion`.

## Stack

| Layer    | Choice                                                                                                               |
| -------- | -------------------------------------------------------------------------------------------------------------------- |
| Frontend | Next.js App Router, React 19, TypeScript strict, Tailwind v4 (CSS-first), shadcn/ui, Lucide, Figtree via `next/font` |
| Backend  | Supabase Postgres via Prisma 7 (driver adapter), Server Actions over a service layer                                 |
| Client   | `useOptimistic` + `useTransition`; TanStack Query for search only; React Hook Form + Zod in the detail panel         |
| Parsing  | `chrono-node`, loaded on first keystroke                                                                             |
| Auth     | Clerk, Google OAuth — M7, and additive because of the `Principal` abstraction                                        |
| Testing  | Vitest, run under four time zones                                                                                    |

Two environment variables, because migrations and runtime need different connections: `DATABASE_URL`
is the Supabase transaction pooler (`:6543`) for the app, and `DIRECT_URL` is the session pooler
(`:5432`) for `prisma migrate`, which cannot run over transaction pooling. Both go in `.env`, not
`.env.local` — the Prisma CLI does not read `.env.local`.

## Running it

```bash
corepack pnpm install
corepack pnpm dev          # http://127.0.0.1:3033
```

`pnpm` may not be on your PATH; `corepack pnpm` works without installing anything.

| Script                | What it does                                                                        |
| --------------------- | ----------------------------------------------------------------------------------- |
| `dev`                 | Dev server on `127.0.0.1:3033`                                                      |
| `dev:utc`             | Same, with the server in UTC — reproduces the production time-zone mismatch locally |
| `build` / `start`     | Production build and serve                                                          |
| `check`               | typecheck + lint + format check + unit tests                                        |
| `test` / `test:watch` | Vitest                                                                              |
| `test:tz`             | The unit suite under four `TZ` values                                               |
| `analyze`             | Bundle treemap                                                                      |

`dev:utc` and `test:tz` are worth knowing about. Normally your dev server and browser share a time
zone, which is exactly the condition that hides the date bugs above. Running the server in UTC while
the browser reports your real zone reproduces what production looks like.

## What is not tested

There are no browser tests. The unit suite covers the pure logic — calendar arithmetic across time
zones, the capture parser, recurrence, fractional ordering — and nothing that renders. Rendering,
navigation, the optimistic paths and the guest cookie are checked by hand.

Worth knowing what that costs, because it has already cost something. The guest cookie's `Secure`
flag was once derived from `NODE_ENV`, and Safari silently refuses a `Secure` cookie over plain http
while Chromium exempts localhost — so guests were lost on every reload in Safari, and a WebKit
browser test is what caught it. **Check cookie and date behaviour in a real Safari before trusting a
deploy.**
