import { QueryClient } from "@tanstack/react-query";

/** One app-wide client, so logout / site change can drop every cached site-specific query. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5_000, retry: 1 },
  },
});
