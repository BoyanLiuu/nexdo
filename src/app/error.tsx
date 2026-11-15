"use client";

import { useEffect } from "react";
import { RotateCw } from "lucide-react";

/**
 * When a view fails to load.
 *
 * Reads are Server Components, so a failed query has no toast to land in — the
 * page simply never arrives. Without this the user gets Next's default error
 * screen, which is a stack trace in development and a blank "something went
 * wrong" in production. Either way it tells them nothing about their data.
 *
 * The honest message is that their tasks are safe and this is a reading
 * problem, because the likely cause is the database being briefly unreachable
 * and the likely fix is trying again. `reset()` re-renders the segment without
 * a full page load, so a transient failure costs one click.
 */
export default function ViewError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server-side causes are already in the platform logs; this catches the
    // client half, which otherwise goes unrecorded.
    console.error("View failed to load:", error);
  }, [error]);

  return (
    <div className="bg-ground grid h-dvh place-items-center px-6">
      <div className="max-w-sm text-center">
        <h1 className="text-ink text-[20px] font-bold">This view would not load</h1>
        <p className="text-ink-2 mt-2 text-[14px] leading-relaxed">
          Nothing has been lost — your tasks are saved. The app could not read them just now, which
          is usually temporary.
        </p>
        <button
          type="button"
          onClick={reset}
          className="rounded-cell bg-blue text-card-paper hover:bg-blue-hover mt-5 inline-flex h-9 items-center gap-2 px-4 text-[14px] font-[650]"
        >
          <RotateCw className="size-4" strokeWidth={2.2} />
          Try again
        </button>
        {error.digest && (
          <p className="text-ink-3 mt-4 font-mono text-[11.5px]">Reference {error.digest}</p>
        )}
      </div>
    </div>
  );
}
