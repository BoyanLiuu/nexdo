# Nexdo

_Focus on what's next._

A personal todo app: type a task in plain words, see what it read before it saves, and keep the day's
work in front of you.

**Progress:** [MILESTONES.md](MILESTONES.md) — what has landed, what is next, and why each decision
was made.

> **Status: early.** The Today screen is built and renders from fixtures. The database, natural-language
> parsing, recurrence and accounts are not in yet — see MILESTONES.md for the order.

## What makes it non-trivial

Three things, none of them the task list itself:

- **"Today" is a calendar concept, not a timestamp.** A due date is stored as `YYYY-MM-DD` text, and
  "due today" is computed in the _user's_ time zone. Because the server renders these views, that zone
  has to be data on the user's record rather than whatever `new Date()` returns in the deploy region —
  otherwise every date boundary is wrong for most of the world.
- **Recurrence regenerates rather than repeats.** Completing an occurrence creates the next one, which
  includes rules like "3 days after I last did this". `RRULE` cannot express that, so the rule is a
  small typed union instead.
- **Perceived latency decides whether a todo app gets used.** Every mutation paints optimistically
  within a frame, and a failure reverts visibly rather than leaving a row looking saved.

## Stack

| Layer    | Choice                                                                                                               |
| -------- | -------------------------------------------------------------------------------------------------------------------- |
| Frontend | Next.js App Router, React 19, TypeScript strict, Tailwind v4 (CSS-first), shadcn/ui, Lucide, Figtree via `next/font` |
| Backend  | Supabase Postgres via Prisma, Server Actions over a service layer                                                    |
| Auth     | Clerk, Google OAuth — optional to start, so the app works before you sign up                                         |
| Testing  | Vitest, Playwright (Chromium and WebKit)                                                                             |

Supabase, Prisma, Clerk, Zustand, TanStack Query, React Hook Form + Zod and Motion arrive in later
milestones. MILESTONES.md says which.

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
| `test:e2e`            | Playwright, Chromium and WebKit                                                     |
| `analyze`             | Bundle treemap                                                                      |

`dev:utc` is worth knowing about. Normally your dev server and browser share a time zone, which is
exactly the condition that hides the date bugs above. Running the server in UTC while the browser
reports your real zone reproduces what production looks like.

## Bundle budget

**200 KB gzipped** for the main route. A todo app has no excuse for more.

| Measure               | Gzipped  | Measured   |
| --------------------- | -------- | ---------- |
| First-load JS for `/` | 128.7 KB | 2026-11-14 |
| All client chunks     | 175.3 KB | 2026-11-14 |

There are currently no client components, so 128.7 KB is the React + Next runtime floor — about 70 KB
of headroom for the app's own client code. The natural-language date parser is the heaviest planned
dependency and loads on first keystroke rather than at page load.
