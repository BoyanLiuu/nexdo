"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  CalendarCheck,
  CalendarDays,
  Inbox,
  Keyboard,
  Plus,
  SquareCheck,
} from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { LIST_DOT } from "@/lib/colours";
import type { Label, List } from "@/lib/types";

/**
 * ⌘K: go somewhere, or do something.
 *
 * Deliberately not the search box. Search answers "where is that task"; the
 * palette answers "take me to Upcoming" or "start a task". Merging them means
 * every navigation query also runs a database search, and every task search
 * competes with view names for the top row.
 *
 * It owns no data. Lists and labels arrive as props from the layout, which
 * already queries them for the rail, so the palette costs no extra request.
 */
export function CommandPalette({
  lists,
  labels,
  onNewTask,
  onShowShortcuts,
}: {
  lists: List[];
  labels: Label[];
  /** Focuses the capture box, which only the view that renders it can do. */
  onNewTask: () => void;
  onShowShortcuts: () => void;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  // ⌘K only. Every other binding has an owner that holds the thing it acts on:
  // `n` lives with the capture box, `?` with the shortcuts dialog, `/` with
  // search. One key, one listener — otherwise a keystroke fires twice and the
  // bindings drift apart.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((previous) => !previous);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** Every item closes the palette, so this wraps rather than repeats it. */
  function run(action: () => void) {
    setOpen(false);
    action();
  }

  const views = [
    { href: "/", label: "Today", icon: CalendarCheck },
    { href: "/upcoming", label: "Upcoming", icon: CalendarDays },
    { href: "/inbox", label: "Inbox", icon: Inbox },
    { href: "/completed", label: "Completed", icon: SquareCheck },
  ];

  const openLists = lists.filter((list) => !list.isArchived);
  const archivedCount = lists.length - openLists.length;

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command palette"
      description="Jump to a view or list, or start a task"
    >
      <CommandInput placeholder="Jump to a view, a list, or start a task…" />
      <CommandList>
        <CommandEmpty>Nothing matches that.</CommandEmpty>

        <CommandGroup heading="Do">
          <CommandItem onSelect={() => run(onNewTask)}>
            <Plus />
            New task
            <CommandShortcut>N</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => run(onShowShortcuts)}>
            <Keyboard />
            Keyboard shortcuts
            <CommandShortcut>?</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Views">
          {views.map((view) => (
            <CommandItem
              key={view.href}
              // cmdk filters on this rather than on rendered children, so a
              // value is needed for anything whose label is not the whole item.
              value={`view ${view.label}`}
              onSelect={() => run(() => router.push(view.href))}
            >
              <view.icon />
              {view.label}
            </CommandItem>
          ))}
        </CommandGroup>

        {openLists.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Lists">
              {openLists.map((list) => (
                <CommandItem
                  key={list.id}
                  value={`list ${list.name}`}
                  onSelect={() => run(() => router.push(`/list/${list.id}`))}
                >
                  <span aria-hidden className={`size-2.5 rounded-[3px] ${LIST_DOT[list.colour]}`} />
                  {list.emoji ? `${list.emoji} ` : ""}
                  {list.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {labels.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Labels">
              {labels.map((label) => (
                <CommandItem
                  key={label.id}
                  value={`label ${label.name}`}
                  onSelect={() => run(() => router.push(`/label/${label.id}`))}
                >
                  <span aria-hidden className={`size-2 rounded-full ${LIST_DOT[label.colour]}`} />@
                  {label.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {archivedCount > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Archived">
              {lists
                .filter((list) => list.isArchived)
                .map((list) => (
                  <CommandItem
                    key={list.id}
                    value={`archived list ${list.name}`}
                    onSelect={() => run(() => router.push(`/list/${list.id}`))}
                  >
                    <Archive />
                    {list.name}
                  </CommandItem>
                ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
