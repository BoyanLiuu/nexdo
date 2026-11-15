/**
 * What every action returns.
 *
 * Actions return failures rather than throwing them. Two reasons:
 *
 *   A thrown Server Action gives the client a generic "an error occurred"
 *   with no message in production, so nothing useful can be shown.
 *
 *   More importantly, a *network-level* failure — server down, connection
 *   refused, offline — does not reject the promise the client awaits. Next
 *   handles it internally, so a `try/catch` around the call never fires and the
 *   mutation fails silently. Treating "resolved with something that isn't a
 *   success" as a failure catches that case, which a catch block cannot.
 */
export type ActionResult = { ok: true } | { ok: false; message: string };

export const ok = (): ActionResult => ({ ok: true });
export const fail = (message: string): ActionResult => ({ ok: false, message });

/**
 * Narrow an action's response on the client. `undefined` means the call never
 * reached the server, or came back malformed.
 */
export function failureMessage(result: ActionResult | undefined, fallback: string): string | null {
  if (result?.ok) return null;
  return result?.message ?? fallback;
}
