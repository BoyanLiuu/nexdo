# Nexdo

_Focus on what's next._

A personal todo app: type a task in plain words, see what it read before it saves, and keep the day's
work in front of you. Project 33 of the build series.

- **Plan and architecture:** `../docs/project-idea/33-todo-list/`
- **Design source:** `../docs/project-idea/33-todo-list/impeccable/index-hallmark.html`
- **Progress:** [MILESTONES.md](MILESTONES.md)

## Stack

Next.js App Router · React 19 · TypeScript strict · Tailwind v4 (CSS-first) · shadcn/ui · Lucide ·
Figtree via `next/font` · Vitest · Playwright.

Supabase Postgres via Prisma, Server Actions, Zustand, TanStack Query, React Hook Form + Zod, Motion
and Clerk arrive in later milestones — see MILESTONES.md for which.

## Running it

`pnpm` is not on PATH in this environment; use `corepack pnpm`.

```bash
corepack pnpm install
corepack pnpm dev          # http://127.0.0.1:3033
```

| Script                | What it does                                                                        |
| --------------------- | ----------------------------------------------------------------------------------- |
| `dev`                 | Dev server on `127.0.0.1:3033`                                                      |
| `dev:utc`             | Same, with the server in UTC — reproduces the production time-zone mismatch locally |
| `build` / `start`     | Production build and serve                                                          |
| `check`               | typecheck + lint + format check + unit tests                                        |
| `test` / `test:watch` | Vitest                                                                              |
| `test:e2e`            | Playwright, Chromium and WebKit                                                     |
| `analyze`             | Bundle treemap                                                                      |

## Bundle budget

**200 KB gzipped** for the main route. A todo app has no excuse for more.

| Measure               | Gzipped  | Measured        |
| --------------------- | -------- | --------------- |
| First-load JS for `/` | 128.7 KB | 2026-11-14 (M0) |
| All client chunks     | 175.3 KB | 2026-11-14 (M0) |

M0 ships zero client components, so 128.7 KB is the React + Next runtime floor — about 70 KB of
headroom for the app's own client code. `chrono-node` (M2) is dynamically imported on first keystroke
rather than loaded at page load, and its absence from the initial payload is an M2 check.

## Dates

The one thing worth reading before touching this code: a due date is a **calendar date**, stored as
`YYYY-MM-DD` text, never a timestamp. "Due today" is computed in the _user's_ zone, not the server's —
and because the server renders these views, that zone has to be data on the owner row rather than
whatever `new Date()` returns in the deploy region.

`src/lib/dates.ts` is provisional until M3 and reads the machine's local zone. Don't rely on it being
correct for anyone but you yet.
