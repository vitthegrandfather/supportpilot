import { createFileRoute } from "@tanstack/react-router";
import { requestId } from "@/lib/pilot/ids";
import { ensureSeeded } from "@/lib/pilot/store";

export const Route = createFileRoute("/api/v1/health")({
  server: {
    handlers: {
      GET: async () => Response.json({ status: "ok", service: "supportpilot-api", request_id: requestId() }),
    },
  },
});

export const readyRoute = {
  GET: async () => {
    await ensureSeeded();
    return Response.json({ status: "ready" });
  },
};
