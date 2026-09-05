import { getSql } from "@/lib/db";
import { ApiError } from "../errors";
import { rid } from "../ids";
import { audit, ensureSeeded } from "../store";
import {
  DEMO_OPERATOR_ID,
  DEMO_WORKSPACE_ID,
  type Category,
  type ConversationMessage,
  type Customer,
  type InternalNote,
  type KnowledgeChunk,
  type KnowledgeDocument,
  type Priority,
  type ReplyDraft,
  type SlaState,
  type TicketListItem,
  type TicketStatus,
} from "../types";
import { runGroundedPipeline } from "../rag/pipeline";
import { SandboxEmbeddingProvider } from "../rag/embedding";
import { applyTicketFilters, type TicketFilters } from "../filters";

export type { TicketFilters };

const embedder = new SandboxEmbeddingProvider();

export function slaState(deadline: string, status: TicketStatus, now = Date.now()): SlaState {
  if (status === "resolved") return "met";
  const d = new Date(deadline).getTime() - now;
  if (d < 0) return "breached";
  if (d < 2 * 3600_000) return "warning";
  return "ok";
}

export async function listTickets(filters: TicketFilters = {}): Promise<TicketListItem[]> {
  await ensureSeeded();
  const sql = await getSql();
  const rows = await sql.query<Record<string, unknown>>(
    `select t.*, c.name as customer_name, c.company as customer_company, o.name as assignee_name
     from tickets t
     join customers c on c.id = t.customer_id
     left join operators o on o.id = t.assignee_id
     where t.workspace_id = $1`,
    [DEMO_WORKSPACE_ID],
  );

  const lastMsgs = await sql.query<{ ticket_id: string; body: string; created_at: string }>(
    `select distinct on (ticket_id) ticket_id, body, created_at
     from conversation_messages
     order by ticket_id, created_at desc`,
  );
  const lastMap = new Map(lastMsgs.map((m) => [m.ticket_id, m]));

  const items: TicketListItem[] = rows.map((r) => {
    const last = lastMap.get(String(r.id));
    const status = r.status as TicketStatus;
    return {
      id: String(r.id),
      workspaceId: String(r.workspace_id),
      publicId: String(r.public_id),
      customerId: String(r.customer_id),
      subject: String(r.subject),
      category: r.category as Category,
      priority: r.priority as Priority,
      status,
      assigneeId: (r.assignee_id as string) ?? null,
      channel: r.channel as TicketListItem["channel"],
      tags: parseJson(r.tags, [] as string[]),
      createdAt: iso(r.created_at),
      updatedAt: iso(r.updated_at),
      firstResponseAt: r.first_response_at ? iso(r.first_response_at) : null,
      resolvedAt: r.resolved_at ? iso(r.resolved_at) : null,
      slaDeadlineAt: iso(r.sla_deadline_at),
      unread: Number(r.unread) === 1,
      showcase: r.showcase as TicketListItem["showcase"],
      customerName: String(r.customer_name),
      customerCompany: String(r.customer_company),
      assigneeName: r.assignee_name ? String(r.assignee_name) : null,
      slaState: slaState(iso(r.sla_deadline_at), status),
      lastActivityAt: last ? iso(last.created_at) : iso(r.updated_at),
      snippet: last?.body.slice(0, 140) ?? "",
    };
  });

  return applyTicketFilters(items, filters);
}

export async function getTicketDetail(ticketId: string) {
  await ensureSeeded();
  const sql = await getSql();
  const tickets = await sql.query<Record<string, unknown>>(
    `select t.*, c.name as customer_name, c.email as customer_email, c.company, c.plan, c.region,
            c.account_id, c.health, o.name as assignee_name
     from tickets t
     join customers c on c.id = t.customer_id
     left join operators o on o.id = t.assignee_id
     where t.workspace_id = $1 and (t.id = $2 or t.public_id = $2)`,
    [DEMO_WORKSPACE_ID, ticketId],
  );
  const t = tickets[0];
  if (!t) throw new ApiError("not_found", "Ticket not found.", 404);

  const messages = await sql.query<Record<string, unknown>>(
    `select * from conversation_messages where ticket_id = $1 order by created_at asc`,
    [t.id],
  );
  const notes = await sql.query<Record<string, unknown>>(
    `select * from internal_notes where ticket_id = $1 order by created_at asc`,
    [t.id],
  );
  const drafts = await sql.query<Record<string, unknown>>(
    `select * from reply_drafts where ticket_id = $1 order by created_at desc`,
    [t.id],
  );
  const citationsByDraft = new Map<string, unknown[]>();
  if (drafts.length) {
    const ids = drafts.map((d) => String(d.id));
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");
    const cits = await sql.query<Record<string, unknown>>(
      `select * from retrieved_citations where draft_id in (${placeholders}) order by marker`,
      ids,
    );
    for (const c of cits) {
      const id = String(c.draft_id);
      const arr = citationsByDraft.get(id) ?? [];
      arr.push(c);
      citationsByDraft.set(id, arr);
    }
  }
  const escalations = await sql.query<Record<string, unknown>>(
    `select * from escalations where ticket_id = $1 order by created_at desc`,
    [t.id],
  );
  const auditEvents = await sql.query<Record<string, unknown>>(
    `select * from audit_events
     where entity_id = $1
        or entity_id in (select id from reply_drafts where ticket_id = $1)
        or metadata_json like '%' || $1 || '%'
     order by created_at desc
     limit 20`,
    [t.id],
  );
  const safetyEvents = await sql.query<Record<string, unknown>>(
    `select * from safety_events where ticket_id = $1 order by created_at desc limit 10`,
    [t.id],
  );

  const ticket = {
    id: String(t.id),
    workspaceId: String(t.workspace_id),
    publicId: String(t.public_id),
    customerId: String(t.customer_id),
    subject: String(t.subject),
    category: t.category as Category,
    priority: t.priority as Priority,
    status: t.status as TicketStatus,
    assigneeId: (t.assignee_id as string) ?? null,
    channel: t.channel as TicketListItem["channel"],
    tags: parseJson(t.tags, [] as string[]),
    createdAt: iso(t.created_at),
    updatedAt: iso(t.updated_at),
    firstResponseAt: t.first_response_at ? iso(t.first_response_at) : null,
    resolvedAt: t.resolved_at ? iso(t.resolved_at) : null,
    slaDeadlineAt: iso(t.sla_deadline_at),
    unread: Number(t.unread) === 1,
    showcase: t.showcase as TicketListItem["showcase"],
    customerName: String(t.customer_name),
    customerCompany: String(t.company),
    assigneeName: t.assignee_name ? String(t.assignee_name) : null,
    slaState: slaState(iso(t.sla_deadline_at), t.status as TicketStatus),
    lastActivityAt: iso(t.updated_at),
    snippet: "",
  };

  const customer: Customer = {
    id: String(t.customer_id),
    workspaceId: DEMO_WORKSPACE_ID,
    name: String(t.customer_name),
    email: String(t.customer_email),
    company: String(t.company),
    plan: String(t.plan),
    region: String(t.region),
    createdAt: iso(t.created_at),
    accountId: String(t.account_id),
    health: t.health as Customer["health"],
  };

  return {
    ticket,
    customer,
    messages: messages.map(mapMessage),
    notes: notes.map(mapNote),
    drafts: drafts.map((d) => mapDraft(d, citationsByDraft.get(String(d.id)) ?? [])),
    escalations: escalations.map((e) => ({
      id: String(e.id),
      ticketId: String(e.ticket_id),
      reason: String(e.reason),
      recommendedQueue: String(e.recommended_queue),
      createdAt: iso(e.created_at),
      createdBy: String(e.created_by),
    })),
    audit: auditEvents.map(mapAudit),
    safetyEvents: safetyEvents.map((e) => ({
      id: String(e.id),
      type: String(e.event_type),
      detail: String(e.detail),
      createdAt: iso(e.created_at),
    })),
  };
}

export async function patchTicket(
  ticketId: string,
  patch: { status?: TicketStatus; priority?: Priority; assigneeId?: string | null },
) {
  await ensureSeeded();
  const sql = await getSql();
  const found = await getRow(ticketId);
  const nextStatus = patch.status ?? (found.status as TicketStatus);
  const resolvedAt = nextStatus === "resolved" ? new Date().toISOString() : found.resolved_at;
  await sql.query(
    `update tickets set status = $1, priority = $2, assignee_id = $3, updated_at = $4, resolved_at = $5, unread = 0
     where id = $6 and workspace_id = $7`,
    [
      nextStatus,
      patch.priority ?? found.priority,
      patch.assigneeId === undefined ? found.assignee_id : patch.assigneeId,
      new Date().toISOString(),
      resolvedAt,
      found.id,
      DEMO_WORKSPACE_ID,
    ],
  );
  await audit("ticket.updated", "ticket", String(found.id), {
    status: patch.status ?? null,
    priority: patch.priority ?? null,
    assigneeId: patch.assigneeId ?? null,
  });
  return getTicketDetail(String(found.id));
}

export async function addInternalNote(ticketId: string, body: string) {
  if (!body.trim()) throw new ApiError("validation_error", "Note body is required.", 422);
  const found = await getRow(ticketId);
  const sql = await getSql();
  const id = rid("nte");
  const createdAt = new Date().toISOString();
  await sql.query(
    `insert into internal_notes (id, ticket_id, author_id, author_name, body, created_at)
     values ($1,$2,$3,$4,$5,$6)`,
    [id, String(found.id), DEMO_OPERATOR_ID, "Elena Voss", body.trim(), createdAt],
  );
  await sql.query(`update tickets set updated_at = $1 where id = $2`, [createdAt, found.id]);
  await audit("ticket.internal_note", "ticket", String(found.id), { noteId: id });
  return { id, ticketId: String(found.id), authorId: DEMO_OPERATOR_ID, authorName: "Elena Voss", body: body.trim(), createdAt };
}

export async function generateDraft(ticketId: string) {
  const detail = await getTicketDetail(ticketId);
  const sql = await getSql();
  const docs = await sql.query<Record<string, unknown>>(
    `select * from knowledge_documents where workspace_id = $1`,
    [DEMO_WORKSPACE_ID],
  );
  const chunks = await sql.query<Record<string, unknown>>(
    `select * from knowledge_chunks where workspace_id = $1`,
    [DEMO_WORKSPACE_ID],
  );
  const customerMsg = [...detail.messages].reverse().find((m) => m.authorType === "customer");
  const seqRows = await sql.query<{ n: number }>(`select count(*)::int as n from reply_drafts`);
  const output = runGroundedPipeline(
    {
      ticketId: detail.ticket.id,
      publicId: detail.ticket.publicId,
      subject: detail.ticket.subject,
      customerName: detail.customer.name,
      customerMessage: customerMsg?.body ?? detail.ticket.subject,
      documents: docs.map(mapDoc),
      chunks: chunks.map(mapChunk),
      draftSeq: (seqRows[0]?.n ?? 0) + 231,
    },
    embedder,
  );

  const runId = rid("run");
  await sql.query(
    `insert into retrieval_runs (id, workspace_id, ticket_id, query, created_at) values ($1,$2,$3,$4,$5)`,
    [runId, DEMO_WORKSPACE_ID, detail.ticket.id, `${detail.ticket.subject}`, new Date().toISOString()],
  );

  await sql.query(
    `insert into reply_drafts (
      id, public_id, ticket_id, state, body, original_body, confidence, classification_json,
      knowledge_gaps_json, escalate, escalate_reason, insufficient_evidence, created_at, updated_at
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      output.draft.id,
      output.draft.publicId,
      detail.ticket.id,
      output.draft.state,
      output.draft.body,
      output.draft.originalBody,
      output.draft.confidence,
      JSON.stringify(output.draft.classification),
      JSON.stringify(output.draft.knowledgeGaps),
      output.draft.escalate ? 1 : 0,
      output.draft.escalateReason,
      output.draft.insufficientEvidence ? 1 : 0,
      output.draft.createdAt,
      output.draft.updatedAt,
    ],
  );

  for (const cit of output.draft.citations) {
    await sql.query(
      `insert into retrieved_citations (
        id, run_id, draft_id, chunk_id, document_id, document_title, section, excerpt, score, marker, flagged
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        cit.id,
        runId,
        output.draft.id,
        cit.chunkId,
        cit.documentId,
        cit.documentTitle,
        cit.section,
        cit.excerpt,
        cit.score,
        cit.marker,
        cit.flagged ? 1 : 0,
      ],
    );
    await sql.query(`update knowledge_documents set usage_count = usage_count + 1 where id = $1`, [cit.documentId]);
  }

  for (const ev of output.safetyEvents) {
    await sql.query(
      `insert into safety_events (id, workspace_id, ticket_id, document_id, event_type, detail, created_at)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [rid("saf"), DEMO_WORKSPACE_ID, detail.ticket.id, null, ev.type, ev.detail, new Date().toISOString()],
    );
  }

  if (output.draft.escalate) {
    await sql.query(
      `insert into escalations (id, ticket_id, reason, recommended_queue, created_at, created_by)
       values ($1,$2,$3,$4,$5,$6)`,
      [
        rid("esc"),
        detail.ticket.id,
        output.draft.escalateReason ?? "Escalation recommended",
        output.draft.insufficientEvidence ? "tier2_policy" : "human_review",
        new Date().toISOString(),
        "sandbox-pipeline",
      ],
    );
    if (detail.ticket.status !== "escalated" && output.draft.insufficientEvidence) {
      await sql.query(`update tickets set status = 'escalated', updated_at = $1 where id = $2`, [
        new Date().toISOString(),
        detail.ticket.id,
      ]);
    }
  }

  await sql.query(`update tickets set unread = 0, updated_at = $1 where id = $2`, [
    new Date().toISOString(),
    detail.ticket.id,
  ]);
  await audit("draft.generated", "draft", output.draft.id, {
    ticketId: detail.ticket.id,
    confidence: output.draft.confidence,
    escalate: output.draft.escalate,
    insufficientEvidence: output.draft.insufficientEvidence,
    safetyEventCount: output.safetyEvents.length,
  });

  return {
    draft: output.draft,
    safetyEvents: output.safetyEvents,
    uncitedSentences: output.uncitedSentences,
  };
}

export async function editDraft(ticketId: string, draftId: string, body: string) {
  const found = await getRow(ticketId);
  const sql = await getSql();
  const drafts = await sql.query<Record<string, unknown>>(
    `select * from reply_drafts where id = $1 and ticket_id = $2`,
    [draftId, found.id],
  );
  if (!drafts[0]) throw new ApiError("not_found", "Draft not found.", 404);
  if (drafts[0].state === "simulated_sent") {
    throw new ApiError("invalid_state", "A simulated sent reply cannot be edited.", 409);
  }
  await sql.query(
    `update reply_drafts set body = $1, state = 'edited', updated_at = $2, approved_by = null, approved_at = null
     where id = $3`,
    [body, new Date().toISOString(), draftId],
  );
  await audit("draft.edited", "draft", draftId, { ticketId: String(found.id) });
  return getTicketDetail(String(found.id));
}

export async function approveDraft(ticketId: string, draftId: string) {
  const found = await getRow(ticketId);
  const sql = await getSql();
  const drafts = await sql.query<Record<string, unknown>>(
    `select * from reply_drafts where id = $1 and ticket_id = $2`,
    [draftId, found.id],
  );
  const d = drafts[0];
  if (!d) throw new ApiError("not_found", "Draft not found.", 404);
  if (Number(d.insufficient_evidence) === 1) {
    throw new ApiError(
      "insufficient_evidence",
      "The knowledge base does not contain enough evidence to draft a reliable answer.",
      409,
    );
  }
  const now = new Date().toISOString();
  await sql.query(
    `update reply_drafts set state = 'approved', approved_by = $1, approved_at = $2, updated_at = $2 where id = $3`,
    [DEMO_OPERATOR_ID, now, draftId],
  );
  await audit("draft.approved", "draft", draftId, { ticketId: String(found.id) });
  return getTicketDetail(String(found.id));
}

export async function sendSimulated(ticketId: string, draftId: string) {
  const found = await getRow(ticketId);
  const sql = await getSql();
  const drafts = await sql.query<Record<string, unknown>>(
    `select * from reply_drafts where id = $1 and ticket_id = $2`,
    [draftId, found.id],
  );
  const d = drafts[0];
  if (!d) throw new ApiError("not_found", "Draft not found.", 404);
  if (d.state !== "approved") {
    throw new ApiError("not_approved", "A draft must be approved by an operator before simulated send.", 409);
  }
  const now = new Date().toISOString();
  await sql.query(
    `insert into conversation_messages (id, ticket_id, author_type, author_name, body, created_at, channel, is_internal, simulated)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [rid("msg"), found.id, "operator", "Elena Voss", String(d.body), now, found.channel, 0, 1],
  );
  await sql.query(
    `update reply_drafts set state = 'simulated_sent', sent_at = $1, updated_at = $1 where id = $2`,
    [now, draftId],
  );
  await sql.query(
    `update tickets set status = case when status = 'new' then 'in_progress' else status end,
      first_response_at = coalesce(first_response_at, $1),
      updated_at = $1, unread = 0
     where id = $2`,
    [now, found.id],
  );
  await audit("draft.simulated_send", "draft", draftId, {
    ticketId: String(found.id),
    disclaimer: "Simulated delivery only. No email or messaging provider was contacted.",
  });
  return getTicketDetail(String(found.id));
}

export async function escalateTicket(ticketId: string, reason: string) {
  const found = await getRow(ticketId);
  const sql = await getSql();
  const now = new Date().toISOString();
  await sql.query(
    `insert into escalations (id, ticket_id, reason, recommended_queue, created_at, created_by)
     values ($1,$2,$3,$4,$5,$6)`,
    [rid("esc"), found.id, reason || "Operator escalation", "human_review", now, DEMO_OPERATOR_ID],
  );
  await sql.query(`update tickets set status = 'escalated', updated_at = $1 where id = $2`, [now, found.id]);
  await audit("ticket.escalated", "ticket", String(found.id), { reason });
  return getTicketDetail(String(found.id));
}

async function getRow(ticketId: string) {
  await ensureSeeded();
  const sql = await getSql();
  const rows = await sql.query<Record<string, unknown>>(
    `select * from tickets where workspace_id = $1 and (id = $2 or public_id = $2)`,
    [DEMO_WORKSPACE_ID, ticketId],
  );
  if (!rows[0]) throw new ApiError("not_found", "Ticket not found.", 404);
  return rows[0];
}

function iso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function parseJson<T>(v: unknown, fallback: T): T {
  if (typeof v !== "string") return (v as T) ?? fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}

function mapMessage(r: Record<string, unknown>): ConversationMessage {
  return {
    id: String(r.id),
    ticketId: String(r.ticket_id),
    authorType: r.author_type as ConversationMessage["authorType"],
    authorName: String(r.author_name),
    body: String(r.body),
    createdAt: iso(r.created_at),
    channel: r.channel as ConversationMessage["channel"],
    isInternal: Number(r.is_internal) === 1,
    simulated: Number(r.simulated) === 1,
  };
}

function mapNote(r: Record<string, unknown>): InternalNote {
  return {
    id: String(r.id),
    ticketId: String(r.ticket_id),
    authorId: String(r.author_id),
    authorName: String(r.author_name),
    body: String(r.body),
    createdAt: iso(r.created_at),
  };
}

function mapDraft(r: Record<string, unknown>, cits: unknown[]): ReplyDraft {
  return {
    id: String(r.id),
    publicId: String(r.public_id),
    ticketId: String(r.ticket_id),
    state: r.state as ReplyDraft["state"],
    body: String(r.body),
    originalBody: String(r.original_body),
    confidence: Number(r.confidence),
    classification: parseJson(r.classification_json, {
      category: "other",
      sentiment: "neutral",
      urgency: "medium",
      suggestedPriority: "normal",
      reasoning: "",
      safetyFlags: [],
    }),
    citations: (cits as Record<string, unknown>[]).map((c) => ({
      id: String(c.id),
      chunkId: String(c.chunk_id),
      documentId: String(c.document_id),
      documentTitle: String(c.document_title),
      section: String(c.section),
      excerpt: String(c.excerpt),
      score: Number(c.score),
      marker: Number(c.marker),
      flagged: Number(c.flagged) === 1,
    })),
    knowledgeGaps: parseJson(r.knowledge_gaps_json, [] as string[]),
    escalate: Number(r.escalate) === 1,
    escalateReason: r.escalate_reason ? String(r.escalate_reason) : null,
    insufficientEvidence: Number(r.insufficient_evidence) === 1,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    approvedBy: r.approved_by ? String(r.approved_by) : null,
    approvedAt: r.approved_at ? iso(r.approved_at) : null,
    sentAt: r.sent_at ? iso(r.sent_at) : null,
  };
}

function mapAudit(r: Record<string, unknown>) {
  return {
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    actorId: String(r.actor_id),
    actorName: String(r.actor_name),
    action: String(r.action),
    entityType: String(r.entity_type),
    entityId: String(r.entity_id),
    metadata: parseJson(r.metadata_json, {} as Record<string, string | number | boolean | null>),
    createdAt: iso(r.created_at),
  };
}

function mapDoc(r: Record<string, unknown>): KnowledgeDocument {
  return {
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    publicId: String(r.public_id),
    title: String(r.title),
    category: r.category as KnowledgeDocument["category"],
    version: String(r.version),
    sourceType: r.source_type as KnowledgeDocument["sourceType"],
    status: r.status as KnowledgeDocument["status"],
    chunkCount: Number(r.chunk_count),
    lastIndexedAt: r.last_indexed_at ? iso(r.last_indexed_at) : null,
    ownerId: String(r.owner_id),
    ownerName: String(r.owner_name),
    usageCount: Number(r.usage_count),
    filename: String(r.filename),
    body: String(r.body ?? ""),
    failedReason: r.failed_reason ? String(r.failed_reason) : null,
    suspicious: Number(r.suspicious) === 1,
  };
}

function mapChunk(r: Record<string, unknown>): KnowledgeChunk {
  return {
    id: String(r.id),
    documentId: String(r.document_id),
    workspaceId: String(r.workspace_id),
    ordinal: Number(r.ordinal),
    section: String(r.section),
    page: r.page == null ? null : Number(r.page),
    text: String(r.text),
    embedding: parseJson(r.embedding, [] as number[]),
    tokenCount: Number(r.token_count),
    flagged: Number(r.flagged) === 1,
    flagReason: r.flag_reason ? String(r.flag_reason) : null,
  };
}

export { mapDoc, mapChunk, parseJson, iso };
