"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Search } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { CHROME_EVENTS } from "@/lib/chrome-events";
import { LIST_DOT } from "@/lib/colours";
import { isTypingTarget } from "@/lib/shortcuts";
import { formatDue } from "@/lib/dates";
import type { Label, List, Task } from "@/lib/types";

type Results = { tasks: Task[]; lists: List[]; labels: Label[] };

/**
 * Search across titles and notes, grouped by list.
 *
 * The only client-fetched data in the app. Debounced by 200ms so a fast typist
 * issues one request rather than one per character, and keyed on the query so
 * TanStack Query serves a cached result when you backspace.
 */
export function SearchDialog({ now }: { now: string }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");

  // `/` from anywhere opens it, matching the hint in the rail. The mobile
  // topbar has no keyboard, so it asks through the chrome event instead.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "/" && !isTypingTarget(document.activeElement)) {
        e.preventDefault();
        setOpen(true);
      }
    }
    function onRequest() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(CHROME_EVENTS.openSearch, onRequest);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(CHROME_EVENTS.openSearch, onRequest);
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(input.trim()), 200);
    return () => clearTimeout(timer);
  }, [input]);

  const { data, isFetching } = useQuery<Results>({
    queryKey: ["search", query],
    enabled: open && query.length >= 2,
    queryFn: async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error("search failed");
      return res.json();
    },
  });

  const listById = new Map((data?.lists ?? []).map((l) => [l.id, l]));

  // Grouped by list, with Inbox last — the brief asks for grouping, and a flat
  // list of twenty matches is harder to scan than four short ones.
  const groups = new Map<string, Task[]>();
  for (const task of data?.tasks ?? []) {
    const key = task.listId ?? "";
    const bucket = groups.get(key);
    if (bucket) bucket.push(task);
    else groups.set(key, [task]);
  }
  const ordered = [...groups.entries()].sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : 0));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-cell border-hair bg-card-paper text-ink-3 hover:border-field-edge mb-1 flex h-9 items-center gap-2 border px-2.5 text-[14px] transition-colors"
      >
        <Search className="size-4" strokeWidth={1.9} />
        <span className="flex-1 text-left">Search</span>
        <kbd className="border-hair text-ink-3 rounded border px-1.5 font-sans text-[11px]">/</kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl gap-0 p-0" showCloseButton={false}>
          <DialogTitle className="sr-only">Search tasks</DialogTitle>
          <DialogDescription className="sr-only">
            Search across task titles and notes
          </DialogDescription>

          <div className="border-hair flex items-center gap-2.5 border-b px-4">
            <Search className="text-ink-3 size-4" strokeWidth={1.9} />
            <input
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search titles and notes"
              aria-label="Search titles and notes"
              className="text-ink placeholder:text-ink-3 h-13 flex-1 bg-transparent text-[15.5px] outline-none"
            />
            {isFetching && <span className="text-ink-3 text-[12px]">…</span>}
          </div>

          <div className="max-h-[60vh] overflow-y-auto p-2">
            {query.length < 2 ? (
              <p className="text-ink-3 px-2 py-6 text-center text-[13.5px]">
                Type at least two characters.
              </p>
            ) : ordered.length === 0 ? (
              <p className="text-ink-3 px-2 py-6 text-center text-[13.5px]">
                Nothing matches “{query}”.
              </p>
            ) : (
              ordered.map(([listId, tasks]) => {
                const list = listById.get(listId);
                return (
                  <div key={listId || "inbox"} className="mb-2">
                    <p className="text-ink-2 flex items-center gap-1.5 px-2 py-1 text-[12px] font-[650]">
                      {list ? (
                        <>
                          <span className={`size-2 rounded-[2px] ${LIST_DOT[list.colour]}`} />
                          {list.name}
                        </>
                      ) : (
                        "Inbox"
                      )}
                    </p>
                    <ul className="list-none">
                      {tasks.map((task) => (
                        <li key={task.id}>
                          <Link
                            href={list ? `/list/${list.id}` : "/inbox"}
                            onClick={() => setOpen(false)}
                            className="hover:bg-hover rounded-cell flex items-baseline gap-2 px-2 py-1.5 text-[14px]"
                          >
                            <span
                              className={
                                task.completedAt
                                  ? "text-ink-3 line-through"
                                  : "text-ink flex-1 truncate"
                              }
                            >
                              {task.title}
                            </span>
                            {task.dueDate && (
                              <span className="text-ink-3 flex-none text-[12.5px]">
                                {formatDue(task.dueDate, now)}
                              </span>
                            )}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
