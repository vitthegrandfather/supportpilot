import { createFileRoute } from "@tanstack/react-router";
import { errorEnvelope } from "@/lib/pilot/errors";
import { requestId } from "@/lib/pilot/ids";
import { listTickets } from "@/lib/pilot/services/tickets";

export const Route = createFileRoute("/api/v1/tickets")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const rid = requestId();
        try {
          const url = new URL(request.url);
          const items = await listTickets({
            q: url.searchParams.get("q") ?? undefined,
            status: url.searchParams.get("status") ?? undefined,
            priority: url.searchParams.get("priority") ?? undefined,
            category: url.searchParams.get("category") ?? undefined,
            assignee: url.searchParams.get("assignee") ?? undefined,
            needsReview: url.searchParams.get("needs_review") === "true",
            sort: (url.searchParams.get("sort") as "newest" | "oldest" | "priority" | "sla") ?? "newest",
          });
          return Response.json({ data: items, request_id: rid });
        } catch (err) {
          const { status, body } = errorEnvelope(err, rid);
          return Response.json(body, { status });
        }
      },
    },
  },
});
