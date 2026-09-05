import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ApiError } from "./errors";
import { generateLimiter, mutateLimiter } from "./safety";
import { OPERATORS } from "./seed/people";
import {
  addInternalNote,
  approveDraft,
  editDraft,
  escalateTicket,
  generateDraft,
  getTicketDetail,
  listTickets,
  patchTicket,
  sendSimulated,
  type TicketFilters,
} from "./services/tickets";
import {
  archiveDocument,
  createTextDocument,
  getDocument,
  listDocuments,
  reindexDocument,
  testRetrieval,
  uploadDocument,
} from "./services/knowledge";
import { analytics, dashboardMetrics } from "./services/metrics";
import { resetDemo } from "./store";
import { DEMO_OPERATOR_ID, type DocumentStatus, type Priority, type TicketStatus } from "./types";

function rate(key: string, limiter = mutateLimiter) {
  if (!limiter.allow(key)) {
    throw new ApiError("rate_limited", "Too many requests. Wait a moment and retry.", 429);
  }
}

const filtersSchema = z.object({
  q: z.string().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  category: z.string().optional(),
  assignee: z.string().optional(),
  needsReview: z.boolean().optional(),
  sort: z.enum(["newest", "oldest", "priority", "sla"]).optional(),
});

export const getSessionFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = OPERATORS.find((o) => o.id === DEMO_OPERATOR_ID)!;
  return {
    auto: true,
    workspace: {
      id: "ws_heliodesk_demo",
      name: "HelioDesk Support",
      product: "HelioDesk Cloud",
      notice: "Demo workspace — every customer, ticket, and metric is fictional.",
    },
    user,
    provider: { embedding: "sandbox-hash-v1", generation: "sandbox-extractive-v1" },
  };
});

export const listTicketsFn = createServerFn({ method: "GET" })
  .validator(filtersSchema)
  .handler(async ({ data }) => listTickets(data as TicketFilters));

export const getTicketFn = createServerFn({ method: "GET" })
  .validator(z.object({ ticketId: z.string() }))
  .handler(async ({ data }) => getTicketDetail(data.ticketId));

export const patchTicketFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      ticketId: z.string(),
      status: z.string().optional(),
      priority: z.string().optional(),
      assigneeId: z.string().nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    rate("patch");
    return patchTicket(data.ticketId, {
      status: data.status as TicketStatus | undefined,
      priority: data.priority as Priority | undefined,
      assigneeId: data.assigneeId,
    });
  });

export const addNoteFn = createServerFn({ method: "POST" })
  .validator(z.object({ ticketId: z.string(), body: z.string() }))
  .handler(async ({ data }) => {
    rate("note");
    return addInternalNote(data.ticketId, data.body);
  });

export const generateDraftFn = createServerFn({ method: "POST" })
  .validator(z.object({ ticketId: z.string() }))
  .handler(async ({ data }) => {
    rate("gen:" + data.ticketId, generateLimiter);
    return generateDraft(data.ticketId);
  });

export const editDraftFn = createServerFn({ method: "POST" })
  .validator(z.object({ ticketId: z.string(), draftId: z.string(), body: z.string() }))
  .handler(async ({ data }) => {
    rate("edit");
    return editDraft(data.ticketId, data.draftId, data.body);
  });

export const approveDraftFn = createServerFn({ method: "POST" })
  .validator(z.object({ ticketId: z.string(), draftId: z.string() }))
  .handler(async ({ data }) => {
    rate("approve");
    return approveDraft(data.ticketId, data.draftId);
  });

export const sendDraftFn = createServerFn({ method: "POST" })
  .validator(z.object({ ticketId: z.string(), draftId: z.string() }))
  .handler(async ({ data }) => {
    rate("send");
    return sendSimulated(data.ticketId, data.draftId);
  });

export const escalateTicketFn = createServerFn({ method: "POST" })
  .validator(z.object({ ticketId: z.string(), reason: z.string() }))
  .handler(async ({ data }) => {
    rate("esc");
    return escalateTicket(data.ticketId, data.reason);
  });

export const dashboardFn = createServerFn({ method: "GET" }).handler(async () => dashboardMetrics());

export const analyticsFn = createServerFn({ method: "GET" })
  .validator(z.object({ rangeDays: z.union([z.literal(7), z.literal(30), z.literal(90)]) }))
  .handler(async ({ data }) => analytics(data.rangeDays));

export const listDocumentsFn = createServerFn({ method: "GET" })
  .validator(
    z.object({
      q: z.string().optional(),
      category: z.string().optional(),
      status: z.string().optional(),
    }),
  )
  .handler(async ({ data }) =>
    listDocuments({
      q: data.q,
      category: data.category,
      status: data.status as DocumentStatus | "all" | undefined,
    }),
  );

export const getDocumentFn = createServerFn({ method: "GET" })
  .validator(z.object({ documentId: z.string() }))
  .handler(async ({ data }) => getDocument(data.documentId));

export const createDocumentFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      title: z.string(),
      body: z.string(),
      category: z.string(),
      filename: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    rate("doc");
    return createTextDocument(data);
  });

export const uploadDocumentFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      filename: z.string(),
      mime: z.string(),
      content: z.string(),
      size: z.number(),
    }),
  )
  .handler(async ({ data }) => {
    rate("upload");
    return uploadDocument(data.filename, data.mime, data.content, data.size);
  });

export const reindexDocumentFn = createServerFn({ method: "POST" })
  .validator(z.object({ documentId: z.string() }))
  .handler(async ({ data }) => {
    rate("reindex");
    return reindexDocument(data.documentId);
  });

export const archiveDocumentFn = createServerFn({ method: "POST" })
  .validator(z.object({ documentId: z.string() }))
  .handler(async ({ data }) => {
    rate("archive");
    return archiveDocument(data.documentId);
  });

export const retrieveTestFn = createServerFn({ method: "POST" })
  .validator(z.object({ question: z.string() }))
  .handler(async ({ data }) => testRetrieval(data.question));

export const resetDemoFn = createServerFn({ method: "POST" }).handler(async () => {
  rate("reset");
  await resetDemo();
  return { ok: true };
});

export const listOperatorsFn = createServerFn({ method: "GET" }).handler(async () => OPERATORS);

export const healthFn = createServerFn({ method: "GET" }).handler(async () => ({
  status: "ok",
  service: "supportpilot",
  provider: "sandbox",
}));
