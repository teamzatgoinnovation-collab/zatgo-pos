import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@zatgo/ui";
import { useEffect, useState, type ReactNode } from "react";
import { useThemeStore } from "@/store/theme";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 5_000, retry: 1 },
        },
      }),
  );
  const apply = useThemeStore((s) => s.apply);
  const mode = useThemeStore((s) => s.mode);

  useEffect(() => {
    apply();
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [apply, mode]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}
