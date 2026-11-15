"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";

/**
 * A right-edge panel, built on Radix Dialog.
 *
 * shadcn's `sheet` is the same thing, but its CLI insists on overwriting
 * `button.tsx` to install it. A sheet *is* a dialog positioned to one side, so
 * this composes the primitive we already have — fewer moving parts, and the
 * design's own drawer shadow and 420px width rather than a generic default.
 *
 * Focus trapping, escape-to-close, scroll locking and `aria-modal` all come
 * from Radix. The only additions are position, size and motion.
 */
export const SidePanel = DialogPrimitive.Root;
export const SidePanelTrigger = DialogPrimitive.Trigger;
export const SidePanelClose = DialogPrimitive.Close;
export const SidePanelTitle = DialogPrimitive.Title;
export const SidePanelDescription = DialogPrimitive.Description;

export function SidePanelContent({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-[rgb(27_31_51/0.28)]" />
      <DialogPrimitive.Content
        className={`bg-card-paper data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right max-w-panel fixed inset-y-0 right-0 z-50 flex w-full flex-col shadow-[-18px_0_40px_-20px_rgb(27_31_51/0.35)] duration-200 ${className}`}
      >
        {children}
        <DialogPrimitive.Close
          aria-label="Close"
          className="text-ink-3 hover:bg-hover hover:text-ink rounded-cell absolute top-3.5 right-3.5 grid size-8 place-items-center transition-colors"
        >
          <X className="size-4.5" strokeWidth={2} />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
