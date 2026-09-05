import { getSql } from "@/lib/db";
import { DEMO_OPERATOR_ID, DEMO_WORKSPACE_ID } from "./types";
import { OPERATORS, CUSTOMERS } from "./seed/people";
import { SEED_DOCUMENTS } from "./seed/documents";
import { SEED_TICKETS } from "./seed/tickets";
import { chunkDocument } from "./rag/chunking";
import { SandboxEmbeddingProvider } from "./rag/embedding";
import { detectPromptInjection } from "./rag/injection";
import { rid } from "./ids";

const embedder = new SandboxEmbeddingProvider();

let seedChain: Promise<void> | null = null;

export async function ensureSeeded(): Promise<void> {
  seedChain ??= (async () => {
    const sql = await getSql();
    const existing = await sql.query<{ n: number }>(
      "select count(*)::int as n from workspaces where id = $1",
      [DEMO_WORKSPACE_ID],
    );
    if ((existing[0]?.n ?? 0) > 0) return;
    await seedAll();
  })().catch((err) => {
    seedChain = null;
    throw err;
  });
  return seedChain;
}

export async function resetDemo(): Promise<void> {
  const sql = await getSql();
  await sql.query("delete from workspaces where id = $1", [DEMO_WORKSPACE_ID]);
  seedChain = null;
  await seedAll();
  seedChain = Promise.resolve();
}

async function seedAll(): Promise<void> {
  const sql = await getSql();
  const now = new Date();

  await sql.query(
    `insert into workspaces (id, name, slug, product_name, timezone, created_at)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (id) do nothing`,
    [
      DEMO_WORKSPACE_ID,
      "HelioDesk Support",
      "heliodesk-demo",
      "HelioDesk Cloud",
      "UTC",
      now.toISOString(),
    ],
  );

  for (const op of OPERATORS) {
    await sql.query(
      `insert into operators (id, workspace_id, name, email, role, title)
       values ($1,$2,$3,$4,$5,$6) on conflict (id) do nothing`,
      [op.id, op.workspaceId, op.name, op.email, op.role, op.title],
    );
  }

  for (const c of CUSTOMERS) {
    await sql.query(
      `insert into customers (id, workspace_id, name, email, company, plan, region, created_at, account_id, health)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict (id) do nothing`,
      [c.id, c.workspaceId, c.name, c.email, c.company, c.plan, c.region, c.createdAt, c.accountId, c.health],
    );
  }

  await sql.query(
    `insert into provider_configurations (id, workspace_id, embedding_provider, generation_provider, confidence_escalate_below, updated_at)
     values ($1,$2,$3,$4,$5,$6) on conflict (id) do nothing`,
    ["cfg_demo", DEMO_WORKSPACE_ID, "sandbox-hash-v1", "sandbox-extractive-v1", 0.55, now.toISOString()],
  );

  for (const doc of SEED_DOCUMENTS) {
    const status = doc.status ?? "ready";
    const chunks = status === "ready" && doc.body ? chunkDocument(doc.body) : [];
    await sql.query(
      `insert into knowledge_documents (
        id, workspace_id, public_id, title, category, version, source_type, status,
        chunk_count, last_indexed_at, owner_id, owner_name, usage_count, filename, body, failed_reason, suspicious
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      on conflict (id) do nothing`,
      [
        doc.id,
        DEMO_WORKSPACE_ID,
        doc.publicId,
        doc.title,
        doc.category,
        doc.version,
        doc.sourceType,
        status,
        chunks.length,
        status === "ready" ? now.toISOString() : null,
        DEMO_OPERATOR_ID,
        doc.ownerName,
        doc.usageCount,
        doc.filename,
        doc.body,
        doc.failedReason ?? null,
        doc.suspicious ? 1 : 0,
      ],
    );
    await sql.query(
      `insert into document_events (id, document_id, stage, detail, created_at) values ($1,$2,$3,$4,$5)`,
      [
        rid("dov"),
        doc.id,
        status === "failed" ? "failed" : "ready",
        status === "failed" ? (doc.failedReason ?? "failed") : "Indexed by sandbox embedding provider",
        now.toISOString(),
      ],
    );
    for (const chunk of chunks) {
      const inj = detectPromptInjection(chunk.text);
      const embedding = JSON.stringify(embedder.embed(chunk.text));
      await sql.query(
        `insert into knowledge_chunks (
          id, document_id, workspace_id, ordinal, section, page, text, embedding, token_count, flagged, flag_reason
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          rid("chk"),
          doc.id,
          DEMO_WORKSPACE_ID,
          chunk.ordinal,
          chunk.section,
          chunk.page,
          chunk.text,
          embedding,
          chunk.tokenCount,
          inj.matched ? 1 : 0,
          inj.matched ? `Prompt-injection patterns: ${inj.patterns.join(", ")}` : null,
        ],
      );
    }
  }

  for (const t of SEED_TICKETS) {
    const created = new Date(now.getTime() - t.hoursAgo * 3600_000);
    const updated = new Date(created.getTime() + 5 * 60_000);
    const sla = new Date(created.getTime() + t.slaHours * 3600_000);
    const first = t.firstResponseHoursAgo != null
      ? new Date(now.getTime() - t.firstResponseHoursAgo * 3600_000)
      : null;
    const resolved = t.resolvedHoursAgo != null
      ? new Date(now.getTime() - t.resolvedHoursAgo * 3600_000)
      : null;
    await sql.query(
      `insert into tickets (
        id, workspace_id, public_id, customer_id, subject, category, priority, status,
        assignee_id, channel, tags, created_at, updated_at, first_response_at, resolved_at,
        sla_deadline_at, unread, showcase
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      on conflict (id) do nothing`,
      [
        t.id,
        DEMO_WORKSPACE_ID,
        t.publicId,
        t.customerId,
        t.subject,
        t.category,
        t.priority,
        t.status,
        t.assigneeId,
        t.channel,
        JSON.stringify(t.tags),
        created.toISOString(),
        updated.toISOString(),
        first?.toISOString() ?? null,
        resolved?.toISOString() ?? null,
        sla.toISOString(),
        t.unread ? 1 : 0,
        t.showcase ?? null,
      ],
    );
    for (const m of t.messages) {
      await sql.query(
        `insert into conversation_messages (
          id, ticket_id, author_type, author_name, body, created_at, channel, is_internal, simulated
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          rid("msg"),
          t.id,
          m.authorType,
          m.authorName,
          m.body,
          new Date(now.getTime() - m.minutesAgo * 60_000).toISOString(),
          m.channel,
          m.isInternal ? 1 : 0,
          0,
        ],
      );
    }
    for (const n of t.notes ?? []) {
      await sql.query(
        `insert into internal_notes (id, ticket_id, author_id, author_name, body, created_at)
         values ($1,$2,$3,$4,$5,$6)`,
        [
          rid("nte"),
          t.id,
          n.authorId,
          n.authorName,
          n.body,
          new Date(now.getTime() - n.minutesAgo * 60_000).toISOString(),
        ],
      );
    }
  }

  await sql.query(
    `insert into audit_events (id, workspace_id, actor_id, actor_name, action, entity_type, entity_id, metadata_json, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      rid("aud"),
      DEMO_WORKSPACE_ID,
      "system",
      "SupportPilot",
      "demo.seeded",
      "workspace",
      DEMO_WORKSPACE_ID,
      JSON.stringify({ tickets: SEED_TICKETS.length, documents: SEED_DOCUMENTS.length }),
      now.toISOString(),
    ],
  );
}

export async function audit(
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, string | number | boolean | null> = {},
  actor = { id: DEMO_OPERATOR_ID, name: "Elena Voss" },
): Promise<void> {
  const sql = await getSql();
  await sql.query(
    `insert into audit_events (id, workspace_id, actor_id, actor_name, action, entity_type, entity_id, metadata_json, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      rid("aud"),
      DEMO_WORKSPACE_ID,
      actor.id,
      actor.name,
      action,
      entityType,
      entityId,
      JSON.stringify(metadata),
      new Date().toISOString(),
    ],
  );
}
