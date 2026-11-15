import { NextResponse } from "next/server";

import { searchSchema } from "@/lib/schemas";
import { assertCan, getPrincipal } from "@/lib/server/principal";
import { labelsFor, listsFor } from "@/lib/server/list-service";
import { searchTasks } from "@/lib/server/task-service";

/**
 * The only Route Handler in the app.
 *
 * Everything else is a Server Component or a Server Action. Search is the one
 * thing those cannot do well: it needs a response per keystroke with client-side
 * caching across them, which is exactly what TanStack Query is for and exactly
 * what an RSC round trip is not.
 *
 * It carries the same preamble as any action — identify, validate, authorize —
 * because a route handler is just as public.
 */
export async function GET(request: Request) {
  const principal = await getPrincipal();
  if (principal.kind === "none") return NextResponse.json({ tasks: [], lists: [], labels: [] });

  try {
    assertCan(principal, "search");
  } catch {
    return NextResponse.json({ error: "Sign in to search." }, { status: 403 });
  }

  const parsed = searchSchema.safeParse({
    q: new URL(request.url).searchParams.get("q") ?? "",
  });
  // Too short is not an error — it is the normal state while typing.
  if (!parsed.success) return NextResponse.json({ tasks: [], lists: [], labels: [] });

  const [tasks, lists, labels] = await Promise.all([
    searchTasks(principal, parsed.data.q),
    listsFor(principal),
    labelsFor(principal),
  ]);

  return NextResponse.json(
    { tasks, lists, labels },
    // Private: the response is scoped to one owner's cookie, so a shared cache
    // would serve one person's tasks to another.
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
