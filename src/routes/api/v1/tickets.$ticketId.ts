import { createFileRoute } from "@tanstack/react-router";
import { errorEnvelope } from "@/lib/pilot/errors";
import { requestId } from "@/lib/pilot/ids";
import { getTicketDetail } from "@/lib/pilot/services/tickets";

export const Route = createFileRoute("/api/v1/tickets/$ticketId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const rid = requestId();
        try {
          const detail = await getTicketDetail(params.ticketId);
          return Response.json({ data: detail, request_id: rid });
        } catch (err) {
          const { status, body } = errorEnvelope(err, rid);
          return Response.json(body, { status });
        }
      },
    },
  },
});
