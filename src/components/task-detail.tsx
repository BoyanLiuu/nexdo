"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import {
  SidePanel,
  SidePanelContent,
  SidePanelDescription,
  SidePanelTitle,
} from "@/components/ui/side-panel";
import { RepeatEditor } from "@/components/repeat-editor";
import { attempt } from "@/lib/actions/attempt";
import { createSubtask, setTaskLabels, updateTask } from "@/lib/actions/task";
import { LIST_DOT } from "@/lib/colours";
import { formatDue } from "@/lib/dates";
import { createId } from "@paralleldrive/cuid2";

import { positionAfter } from "@/lib/ordering";
import { isoDate, isoTime } from "@/lib/schemas";
import type { Label, List, Priority, Task } from "@/lib/types";

/**
 * Everything about one task that is not its title or its checkbox.
 *
 * React Hook Form owns the in-flight values and nothing else does — per the
 * house rule of one owner per piece of state. On submit it calls the action and
 * stops being the owner; the RSC payload takes over. There is deliberately no
 * optimistic layer here: a detail edit does not change which rows are shown, so
 * waiting for the save is honest and the panel can report a field-level error.
 */

/** The form's own schema, derived from the action's field rules. */
const formSchema = z.object({
  title: z.string().trim().min(1, "A task needs a title").max(500),
  notes: z.string().max(10_000),
  dueDate: z.union([isoDate, z.literal("")]),
  dueTime: z.union([isoTime, z.literal("")]),
  // A <select> yields a string, so the form holds a string and converts on
  // submit. `z.coerce.number()` would type the resolver's input as `unknown`
  // and no longer match the form's own values type.
  priority: z.enum(["1", "2", "3", "4"]),
  listId: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 1, label: "P1 — highest" },
  { value: 2, label: "P2" },
  { value: 3, label: "P3" },
  { value: 4, label: "None" },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-ink-2 mb-1.5 block text-[12.5px] font-[650]">{label}</span>
      {children}
    </label>
  );
}

const INPUT =
  "w-full rounded-cell border border-hair bg-card-paper px-2.5 py-2 text-[14px] text-ink outline-none focus-visible:border-blue";

export function TaskDetail({
  task,
  subtasks,
  lists,
  labels,
  now,
  open,
  onOpenChange,
  onCreateSubtask,
}: {
  task: Task;
  subtasks: Task[];
  lists: List[];
  labels: Label[];
  now: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Hands the new subtask to whoever owns the subtask array, so it draws before
   * the insert lands. Called inside this component's transition, which is what
   * holds the optimistic row until the action settles.
   */
  onCreateSubtask?: (subtask: Task) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [selectedLabels, setSelectedLabels] = useState<string[]>(task.labelIds);
  const [subtaskTitle, setSubtaskTitle] = useState("");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: task.title,
      notes: task.notes,
      dueDate: task.dueDate ?? "",
      dueTime: task.dueTime ?? "",
      priority: String(task.priority) as "1" | "2" | "3" | "4",
      listId: task.listId ?? "",
    },
  });

  function save(values: FormValues) {
    startTransition(async () => {
      const outcome = await attempt(
        () =>
          updateTask({
            id: task.id,
            title: values.title,
            notes: values.notes,
            // An empty field means "no date", not "unchanged" — the panel always
            // sends the full picture of what it edits.
            dueDate: values.dueDate || null,
            dueTime: values.dueTime || null,
            priority: Number(values.priority) as Priority,
            listId: values.listId || null,
          }),
        "Could not save those changes.",
      );

      if (outcome.status === "ok") {
        onOpenChange(false);
        return;
      }
      if (outcome.status === "slow") toast.warning("Still saving.");
      else toast.error(outcome.message);
    });
  }

  function toggleLabel(id: string) {
    const next = selectedLabels.includes(id)
      ? selectedLabels.filter((l) => l !== id)
      : [...selectedLabels, id];
    setSelectedLabels(next);

    // Labels save on click rather than on submit: it is a toggle, and a toggle
    // that only takes effect after a Save button is a toggle people mistrust.
    startTransition(async () => {
      const outcome = await attempt(
        () => setTaskLabels({ id: task.id, labelIds: next }),
        "Could not save those labels.",
      );
      if (outcome.status !== "ok" && outcome.status !== "slow") {
        setSelectedLabels(selectedLabels);
        toast.error(outcome.message);
      }
    });
  }

  function addSubtask() {
    const title = subtaskTitle.trim();
    if (!title) return;
    setSubtaskTitle("");

    // Minted here for the same reason task creation does it: the row is drawn
    // from this data, so it has to carry the identity the row will be stored
    // with. The key chains from the last subtask on screen, and the generator
    // is deterministic, so the server lands on the same one.
    const id = createId();
    const position = positionAfter(subtasks.at(-1)?.position ?? null);

    startTransition(async () => {
      // Before the await and inside the transition, so React holds the row
      // until the action settles and then takes the server's version.
      onCreateSubtask?.({
        id,
        position,
        parentId: task.id,
        title,
        // What a new subtask is by definition — not guesses. It inherits its
        // parent's list, which is what the service stores.
        listId: task.listId,
        notes: "",
        dueDate: null,
        dueTime: null,
        priority: 4,
        labelIds: [],
        completedAt: null,
        repeat: null,
        seriesId: null,
      });

      const outcome = await attempt(
        () => createSubtask({ parentId: task.id, title, id, position }),
        "Could not add that subtask.",
      );
      if (outcome.status !== "ok" && outcome.status !== "slow") {
        setSubtaskTitle(title);
        toast.error(outcome.message);
      }
    });
  }

  const done = subtasks.filter((s) => s.completedAt !== null).length;

  return (
    <SidePanel open={open} onOpenChange={onOpenChange}>
      <SidePanelContent>
        <form onSubmit={form.handleSubmit(save)} className="flex min-h-0 flex-1 flex-col">
          <div className="border-hair border-b px-5 py-4 pr-14">
            <SidePanelTitle className="text-ink-3 text-[13px] font-[650]">Task</SidePanelTitle>
            <SidePanelDescription className="sr-only">
              Edit this task&apos;s details
            </SidePanelDescription>
            <input
              {...form.register("title")}
              aria-label="Title"
              aria-invalid={!!form.formState.errors.title}
              className="text-ink mt-1 w-full bg-transparent text-[18px] leading-snug font-bold outline-none"
            />
            {form.formState.errors.title && (
              <p role="alert" className="text-verm mt-1 text-[12.5px]">
                {form.formState.errors.title.message}
              </p>
            )}
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
            <Field label="Notes">
              <textarea
                {...form.register("notes")}
                rows={4}
                placeholder="Markdown is fine."
                className={`${INPUT} resize-y`}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Due date">
                <input type="date" {...form.register("dueDate")} className={INPUT} />
              </Field>
              <Field label="Time">
                <input type="time" {...form.register("dueTime")} className={INPUT} />
              </Field>
            </div>
            {task.dueDate && (
              <p className="text-ink-3 -mt-3 text-[12.5px]">
                Currently {formatDue(task.dueDate, now)}
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Priority">
                <select {...form.register("priority")} className={INPUT}>
                  {PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="List">
                <select {...form.register("listId")} className={INPUT}>
                  <option value="">Inbox — no list</option>
                  {lists
                    .filter((l) => !l.isArchived)
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.emoji ? `${l.emoji} ` : ""}
                        {l.name}
                      </option>
                    ))}
                </select>
              </Field>
            </div>

            {labels.length > 0 && (
              <div>
                <span className="text-ink-2 mb-1.5 block text-[12.5px] font-[650]">Labels</span>
                <div className="flex flex-wrap gap-1.5">
                  {labels.map((label) => {
                    const on = selectedLabels.includes(label.id);
                    return (
                      <button
                        key={label.id}
                        type="button"
                        onClick={() => toggleLabel(label.id)}
                        aria-pressed={on}
                        className={`rounded-cell inline-flex h-7 items-center gap-1.5 px-2.5 text-[13px] font-[550] transition-colors ${
                          on ? "bg-blue text-card-paper" : "bg-hover text-ink-2 hover:text-ink"
                        }`}
                      >
                        <span className={`size-2 rounded-full ${LIST_DOT[label.colour]}`} />@
                        {label.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <RepeatEditor
              taskId={task.id}
              repeat={task.repeat}
              dueDate={task.dueDate}
              today={now}
            />

            <div>
              <span className="text-ink-2 mb-1.5 block text-[12.5px] font-[650]">
                Subtasks{subtasks.length > 0 && ` · ${done}/${subtasks.length}`}
              </span>
              {subtasks.length > 0 && (
                <>
                  <div className="bg-hair-soft mb-2.5 h-1 overflow-hidden rounded-full">
                    <div
                      className="bg-blue h-full rounded-full transition-[width]"
                      style={{ width: `${(done / subtasks.length) * 100}%` }}
                    />
                  </div>
                  <ul className="mb-2 list-none">
                    {subtasks.map((s) => (
                      <li
                        key={s.id}
                        className="border-hair-soft flex items-center gap-2.5 border-b py-2 text-[14px] last:border-0"
                      >
                        <span
                          aria-hidden
                          className={`size-4 rounded-[5px] border-[1.5px] ${
                            s.completedAt ? "border-blue bg-blue" : "border-field-edge"
                          }`}
                        />
                        <span className={s.completedAt ? "text-ink-3 line-through" : "text-ink"}>
                          {s.title}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <div className="flex gap-2">
                <input
                  value={subtaskTitle}
                  onChange={(e) => setSubtaskTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      // Inside a form, so Enter would submit the whole panel.
                      e.preventDefault();
                      addSubtask();
                    }
                  }}
                  placeholder="Add a subtask"
                  aria-label="Add a subtask"
                  className={INPUT}
                />
                <button
                  type="button"
                  onClick={addSubtask}
                  aria-label="Add subtask"
                  className="rounded-cell border-hair text-ink-2 hover:border-field-edge grid size-9 flex-none place-items-center border"
                >
                  <Plus className="size-4" strokeWidth={2} />
                </button>
              </div>
            </div>
          </div>

          <div className="border-hair flex items-center justify-end gap-2 border-t px-5 py-3.5">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-cell text-ink-2 hover:bg-hover h-9 px-3 text-[14px] font-[550]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-cell bg-blue text-card-paper hover:bg-blue-hover h-9 px-4 text-[14px] font-[650] disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </SidePanelContent>
    </SidePanel>
  );
}
