import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { useState } from "react";
import { Toaster } from "sonner";
import appCss from "../styles.css?url";

const APP_NAME = "SupportPilot";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      {
        name: "description",
        content:
          "SupportPilot is a fictional AI-assisted customer support workspace for grounded replies, citations, and human approval.",
      },
      { name: "theme-color", content: "#0B1C2C" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap",
      },
    ],
  }),
  component: RootDocument,
});

function RootDocument() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <html lang="en" suppressHydrationWarning className="antialiased">
      <head>
        <HeadContent />
      </head>
      <body className="bg-paper text-ink font-sans">
        <QueryClientProvider client={queryClient}>
          <Outlet />
          <Toaster
            position="bottom-right"
            toastOptions={{
              className:
                "font-sans text-sm border border-line bg-surface text-ink shadow-[var(--shadow-border)]",
            }}
          />
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
