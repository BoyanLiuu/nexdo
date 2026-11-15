import { Plus } from "lucide-react";

/**
 * The always-available capture box. Sits directly under the view header inside
 * the sticky region, matching the prototype — the input stays reachable from
 * anywhere in a long list.
 *
 * Presentation only in M0: no handler, no state. M1 wires Enter to the create
 * action, M2 adds the parsed-token chips that render beneath the input.
 */
export function Capture() {
  return (
    <div className="relative mb-1.5">
      <div className="rounded-panel border-hair bg-card-paper shadow-item focus-within:border-field-edge border">
        <div className="grid h-13 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 pr-2.5 pl-3.5">
          <Plus className="text-blue size-5" strokeWidth={2.2} />
          <input
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="Add a task — try “pay rent friday p1”"
            aria-label="Add a task"
            className="text-ink caret-blue placeholder:text-ink-3 bg-transparent text-[15.5px] outline-none"
          />
          <kbd className="border-hair text-ink-3 hidden rounded border px-1.5 py-0.5 font-sans text-[11px] md:block">
            N
          </kbd>
        </div>
      </div>
    </div>
  );
}
