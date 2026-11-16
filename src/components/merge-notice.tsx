"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";

/**
 * Tells you when signing in moved work into an account that already had some.
 *
 * The claim route puts the count in `?merged=`. Without this the parameter was
 * written and never read — worse than not reporting it at all, because the code
 * looked like it reported something.
 *
 * **Not a toast**, which was the first attempt and did not survive. The message
 * arrives *with* the page: this fires on mount, during the streaming pass that
 * is still assembling the view, and the toast was gone inside 400ms every time.
 * Measured — and not caused by the URL rewrite I first blamed, which turning it
 * off disproved. Toasts are for things that happen while a page is already
 * live; something that has to survive the page's arrival must be rendered
 * rather than announced.
 *
 * It reads better as a card anyway: moving someone's tasks between owners is
 * the most surprising thing this app does, and a notice that waits to be
 * dismissed is more honest than one that vanishes whether or not it was seen.
 */
export function MergeNotice() {
  const params = useSearchParams();
  const [dismissed, setDismissed] = useState(false);

  const merged = params.get("merged");
  const count = Number(merged);

  if (merged === null || !Number.isFinite(count) || count < 1 || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    // Drop the parameter so a reload does not announce it again, and so a copied
    // URL is not carrying a one-time event. `history.replaceState` rather than
    // the router: this is an address-bar tidy-up, not a navigation, and the
    // router would re-render the whole tree to achieve it.
    const url = new URL(window.location.href);
    url.searchParams.delete("merged");
    window.history.replaceState(null, "", url);
  }

  return (
    <div
      role="status"
      className="rounded-panel border-hair bg-card-paper shadow-item fixed bottom-5 left-1/2 z-50 flex max-w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 items-start gap-3 border px-4 py-3"
    >
      <div className="min-w-0">
        <p className="text-ink text-[14px] font-[650]">
          {count === 1
            ? "Added the task you had before signing in."
            : `Added ${count} tasks you had before signing in.`}
        </p>
        <p className="text-ink-2 mt-0.5 text-[13px] leading-snug">
          This account already had tasks, so yours were added to it.
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="text-ink-3 hover:bg-hover hover:text-ink rounded-cell -mt-1 -mr-1.5 grid size-7 flex-none place-items-center transition-colors"
      >
        <X className="size-4" strokeWidth={2} />
      </button>
    </div>
  );
}
