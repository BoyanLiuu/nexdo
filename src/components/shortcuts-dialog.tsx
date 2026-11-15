"use client";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { SHORTCUT_GROUPS } from "@/lib/shortcuts";

/**
 * The shortcut list, rendered from the same array the bindings are documented
 * in (`lib/shortcuts.ts`). There is no second list to fall out of date.
 */
export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogTitle className="text-[16px] font-bold">Keyboard shortcuts</DialogTitle>
        <DialogDescription className="text-ink-2 text-[13.5px]">
          Nexdo is usable without a mouse. Everything below works today.
        </DialogDescription>

        <div className="mt-1 space-y-5">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="text-ink-3 mb-1.5 text-[12px] font-[650] tracking-wide uppercase">
                {group.title}
              </h3>
              <dl className="space-y-1">
                {group.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.description}
                    className="border-hair-soft flex items-baseline justify-between gap-4 border-b py-1.5 last:border-0"
                  >
                    <dt className="text-ink text-[13.5px]">{shortcut.description}</dt>
                    <dd className="flex flex-none gap-1">
                      {shortcut.keys.map((key) => (
                        <kbd
                          key={key}
                          className="border-hair text-ink-2 bg-hover rounded border px-1.5 py-0.5 font-sans text-[11.5px] font-[650]"
                        >
                          {key}
                        </kbd>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
