import { QueryClient } from "@tanstack/react-query";

export const createPopupQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        gcTime: Infinity,
        networkMode: "always",
      },
    },
  });
