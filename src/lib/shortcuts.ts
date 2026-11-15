/**
 * Every keyboard binding in the app, in one list.
 *
 * The help overlay renders this, so a shortcut that exists but is undocumented
 * is impossible by construction — the overlay cannot drift from the bindings
 * because it has no second list to drift from. Adding a binding means adding a
 * row here, which is the point.
 */

export type Shortcut = { keys: string[]; description: string };
export type ShortcutGroup = { title: string; shortcuts: Shortcut[] };

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Anywhere",
    shortcuts: [
      { keys: ["⌘", "K"], description: "Command palette" },
      { keys: ["/"], description: "Search tasks and notes" },
      { keys: ["N"], description: "New task" },
      { keys: ["?"], description: "This list" },
      { keys: ["Esc"], description: "Close what is open" },
    ],
  },
  {
    title: "In a list",
    shortcuts: [
      { keys: ["J", "K"], description: "Move between tasks, from anywhere" },
      { keys: ["↑", "↓"], description: "Move between tasks, once one is focused" },
      { keys: ["Space"], description: "Complete or reopen" },
      { keys: ["Enter"], description: "Open details" },
      { keys: ["E"], description: "Rename in place" },
      { keys: ["⌥", "↑", "↓"], description: "Reorder, in manual sort" },
      { keys: ["⌫"], description: "Delete, with undo" },
    ],
  },
  {
    title: "Capture box",
    shortcuts: [
      { keys: ["Enter"], description: "Save, with what the chips show" },
      { keys: ["⌫"], description: "Dismiss the last chip, returning its words" },
      { keys: ["Esc"], description: "Clear and leave" },
    ],
  },
];

/**
 * True when a keystroke belongs to whatever the user is typing into.
 *
 * Single-letter shortcuts are hostile without this: `n` inside the capture box
 * must be the letter n, not "new task". `contentEditable` is included because
 * one will eventually appear in the notes field.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}
