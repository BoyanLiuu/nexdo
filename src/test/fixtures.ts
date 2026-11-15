import type { Label, List, Task } from "@/lib/types";

/**
 * Read-only sample data for M0. The Today screen renders from this until M1
 * replaces the import with a `taskService` call.
 *
 * Deliberately NOT a store: no localStorage, no reducer, no mutation.
 * M0 guardrails in MILESTONES.md — a local store here would turn M1's
 * one-line swap into a rewrite of the view tree.
 *
 * Dates are offsets from the current local day so the Overdue / Today /
 * Upcoming groups stay meaningful as time passes. Zone-correct "today" is M3's
 * job; local time is close enough to lay out a screen.
 */
function day(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const lists: List[] = [
  { id: "l-work", name: "Work", colour: "sky", emoji: null, position: "a0", isArchived: false },
  { id: "l-home", name: "Home", colour: "grass", emoji: null, position: "a1", isArchived: false },
  {
    id: "l-errands",
    name: "Errands",
    colour: "orange",
    emoji: null,
    position: "a2",
    isArchived: false,
  },
  {
    id: "l-health",
    name: "Health",
    colour: "rose",
    emoji: null,
    position: "a3",
    isArchived: false,
  },
  {
    id: "l-alps",
    name: "Alps trip",
    colour: "teal",
    emoji: "🏔",
    position: "a4",
    isArchived: false,
  },
  {
    id: "l-reading",
    name: "Reading",
    colour: "violet",
    emoji: null,
    position: "a5",
    isArchived: false,
  },
  {
    id: "l-2023",
    name: "2023 review",
    colour: "slate",
    emoji: null,
    position: "a6",
    isArchived: true,
  },
];

export const labels: Label[] = [
  { id: "b-deep", name: "deep work", colour: "violet" },
  { id: "b-quick", name: "quick", colour: "olive" },
  { id: "b-waiting", name: "waiting", colour: "brown" },
];

const t = (task: Partial<Task> & Pick<Task, "id" | "title">): Task => ({
  listId: null,
  parentId: null,
  notes: "",
  dueDate: null,
  dueTime: null,
  priority: 4,
  position: "a0",
  labelIds: [],
  repeat: null,
  seriesId: null,
  completedAt: null,
  ...task,
});

export const tasks: Task[] = [
  // ── Overdue ───────────────────────────────────────────────────────────────
  t({
    id: "t-rent",
    title: "Pay the rent",
    listId: "l-home",
    dueDate: day(-3),
    priority: 1,
    position: "a0",
  }),
  t({
    id: "t-invoice",
    title: "Send October invoice",
    listId: "l-work",
    dueDate: day(-1),
    priority: 2,
    position: "a1",
    labelIds: ["b-quick"],
  }),
  t({
    id: "t-dentist",
    title: "Reschedule the dentist",
    listId: "l-health",
    dueDate: day(-1),
    position: "a2",
    labelIds: ["b-waiting"],
  }),

  // ── Today ─────────────────────────────────────────────────────────────────
  t({
    id: "t-standup",
    title: "Write the sprint update",
    listId: "l-work",
    dueDate: day(0),
    dueTime: "09:30",
    priority: 2,
    position: "b0",
    labelIds: ["b-deep"],
  }),
  t({
    id: "t-plants",
    title: "Water the plants",
    listId: "l-home",
    dueDate: day(0),
    position: "b1",
    notes: "Only the ferns — the succulents were done on Sunday.",
  }),
  t({
    id: "t-visa",
    title: "Book the Innsbruck train",
    listId: "l-alps",
    dueDate: day(0),
    priority: 1,
    position: "b2",
  }),
  t({
    id: "t-call",
    title: "Call mum",
    dueDate: day(0),
    dueTime: "19:00",
    priority: 3,
    position: "b3",
  }),
  t({
    id: "t-review",
    title: "Review the pull request",
    listId: "l-work",
    dueDate: day(0),
    position: "b4",
    labelIds: ["b-deep", "b-quick"],
  }),

  // ── Today, with subtasks ──────────────────────────────────────────────────
  t({
    id: "t-pack",
    title: "Pack for the Alps",
    listId: "l-alps",
    dueDate: day(0),
    priority: 2,
    position: "b5",
    notes: "Boots are still at the cobbler.",
  }),
  t({
    id: "t-pack-1",
    title: "Collect boots",
    listId: "l-alps",
    parentId: "t-pack",
    position: "c0",
    completedAt: `${day(-1)}T17:02:00.000Z`,
  }),
  t({
    id: "t-pack-2",
    title: "Charge the head torch",
    listId: "l-alps",
    parentId: "t-pack",
    position: "c1",
  }),
  t({
    id: "t-pack-3",
    title: "Print the hut booking",
    listId: "l-alps",
    parentId: "t-pack",
    position: "c2",
  }),

  // ── Upcoming ──────────────────────────────────────────────────────────────
  t({
    id: "t-bins",
    title: "Put the bins out",
    listId: "l-home",
    dueDate: day(1),
    dueTime: "07:00",
    position: "d0",
  }),
  t({ id: "t-swim", title: "Swim", listId: "l-health", dueDate: day(1), position: "d1" }),
  t({
    id: "t-retro",
    title: "Prep the retro",
    listId: "l-work",
    dueDate: day(2),
    priority: 3,
    position: "d2",
    labelIds: ["b-deep"],
  }),
  t({
    id: "t-parcel",
    title: "Return the parcel",
    listId: "l-errands",
    dueDate: day(3),
    position: "d3",
  }),
  t({
    id: "t-gift",
    title: "Buy a birthday card",
    listId: "l-errands",
    dueDate: day(5),
    priority: 2,
    position: "d4",
  }),
  t({
    id: "t-shelf",
    title: "Fix the shelf bracket",
    listId: "l-home",
    dueDate: day(6),
    position: "d5",
  }),

  // ── No date (Inbox) ───────────────────────────────────────────────────────
  t({
    id: "t-pension",
    title: "Look into the pension transfer",
    position: "e0",
    labelIds: ["b-waiting"],
  }),
  t({ id: "t-lens", title: "Sell the old lens", position: "e1" }),
  t({
    id: "t-idea",
    title: "Sketch the garden layout",
    position: "e2",
    notes: "Raised beds along the south wall.",
  }),
  t({ id: "t-book", title: "Finish the Le Guin essays", listId: "l-reading", position: "e3" }),

  // ── Completed ─────────────────────────────────────────────────────────────
  t({
    id: "t-done-1",
    title: "Renew the travel insurance",
    listId: "l-alps",
    dueDate: day(-2),
    position: "f0",
    completedAt: `${day(-2)}T11:20:00.000Z`,
  }),
  t({
    id: "t-done-2",
    title: "Reply to the landlord",
    listId: "l-home",
    dueDate: day(0),
    position: "f1",
    completedAt: `${day(0)}T08:05:00.000Z`,
  }),
];
