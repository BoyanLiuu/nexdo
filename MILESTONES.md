# Nexdo — milestones

_Focus on what's next._

Progress tracker for the build. The plan and architecture live in
`../docs/project-idea/33-todo-list/`; this file records what has actually landed.

**Last verified:** 2026-11-14 — M0 complete, `pnpm check` and `pnpm test:e2e` green.

|     | Milestone                                     | Status  |
| --- | --------------------------------------------- | ------- |
| M0  | Scaffold and the Today screen (fixtures)      | ✅ done |
| M1  | Database, principal, optimistic mutation path | ☐       |
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

## Conventions

- `pnpm check` = typecheck + lint + format check + unit tests. Green before every milestone commit.
- `pnpm test:e2e` runs Chromium and WebKit; WebKit matters because the brief requires iOS Safari.
- Dev binds `127.0.0.1:3033`; Playwright builds and serves on `127.0.0.1:3133`.
- `pnpm dev:utc` runs the server in UTC while the browser reports its real zone — the only way to
  reproduce the production time-zone mismatch locally before M8.
- `pnpm` is not on PATH in this environment; use `corepack pnpm`, or a shim on PATH for tools that
  spawn `pnpm` directly (`create-next-app` does).
