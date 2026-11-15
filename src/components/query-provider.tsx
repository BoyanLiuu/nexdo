"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

/**
 * TanStack Query, scoped to search only.
 *
 * It deliberately does not own task data — the RSC payload does. Caching the
 * same rows here would create a second read path that can disagree with the
 * server's. Its job is the one thing RSC cannot do: cache results across
 * keystrokes while the user types.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  // Created in state so each browser tab gets one client, and so it is never
  // shared across requests on the server.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Search results are cheap to refetch and stale almost immediately
            // once tasks change, so keep the window short.
            staleTime: 10_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
