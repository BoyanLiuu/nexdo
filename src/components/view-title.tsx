import { notFound } from "next/navigation";

import { labelsFor, listsFor } from "@/lib/server/list-service";
import { getPrincipal } from "@/lib/server/principal";

/**
 * Resolves a list or label name inside the route's Suspense boundary.
 *
 * Doing this in the route body instead would make Next abandon prerendering the
 * shell, because `getPrincipal()` reads a cookie. The heading streams in a beat
 * later, which is the right trade.
 *
 * `notFound()` here is deliberate: a guessed id and someone else's id are
 * indistinguishable, because both services filter on `ownerId`.
 */
export async function ListTitle({ id }: { id: string }) {
  const principal = await getPrincipal();
  const list =
    principal.kind === "none" ? undefined : (await listsFor(principal)).find((l) => l.id === id);
  if (!list) notFound();
  return <>{list.emoji ? `${list.emoji} ${list.name}` : list.name}</>;
}

export async function LabelTitle({ id }: { id: string }) {
  const principal = await getPrincipal();
  const label =
    principal.kind === "none" ? undefined : (await labelsFor(principal)).find((l) => l.id === id);
  if (!label) notFound();
  return <>@{label.name}</>;
}

/** Holds the heading's height while the name resolves. */
export function TitleFallback() {
  return (
    <span
      aria-hidden
      className="bg-hair inline-block h-7 w-40 animate-pulse rounded align-middle"
    />
  );
}
