import { createFileRoute } from "@tanstack/react-router";
import { errorEnvelope } from "@/lib/pilot/errors";
import { requestId } from "@/lib/pilot/ids";
import { resetDemo } from "@/lib/pilot/store";

export const Route = createFileRoute("/api/v1/demo/reset")({
  server: {
    handlers: {
      POST: async () => {
        const rid = requestId();
        try {
          await resetDemo();
          return Response.json({ ok: true, request_id: rid });
        } catch (err) {
          const { status, body } = errorEnvelope(err, rid);
          return Response.json(body, { status });
        }
      },
    },
  },
});
