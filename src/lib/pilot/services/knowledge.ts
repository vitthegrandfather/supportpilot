import { getSql } from "@/lib/db";
import { ApiError } from "../errors";
import { rid, nextPublicId } from "../ids";
import { audit, ensureSeeded } from "../store";
import { chunkDocument } from "../rag/chunking";
import { SandboxEmbeddingProvider } from "../rag/embedding";
import { detectPromptInjection } from "./../rag/injection";
import { retrieve } from "../rag/retrieval";
import { rankEvidence } from "../rag/ranking";
import { extractDocument } from "../extraction";
import { sanitizeFilename, validateUpload } from "../safety";
import {
  DEMO_OPERATOR_ID,
  DEMO_WORKSPACE_ID,
  type DocumentStatus,
  type KnowledgeChunk,
  type KnowledgeDocument,
} from "../types";
import { iso, mapChunk, mapDoc } from "./tickets";

const embedder = new SandboxEmbeddingProvider();

export async function listDocuments(filters: {
  q?: string;
  category?: string;
  status?: DocumentStatus | "all";
}) {
  await ensureSeeded();
  const sql = await getSql();
  const rows = await sql.query<Record<string, unknown>>(
    `select * from knowledge_documents where workspace_id = $1 order by title`,
    [DEMO_WORKSPACE_ID],
  );
  let docs = rows.map(mapDoc);
  if (filters.q) {
    const q = filters.q.toLowerCase();
    docs = docs.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.publicId.toLowerCase().includes(q) ||
        d.filename.toLowerCase().includes(q),
    );
  }
  if (filters.category && filters.category !== "all") {
    docs = docs.filter((d) => d.category === filters.category);
  }
  if (filters.status && filters.status !== "all") {
    docs = docs.filter((d) => d.status === filters.status);
  }
  return docs;
}

export async function getDocument(id: string) {
  await ensureSeeded();
  const sql = await getSql();
  const rows = await sql.query<Record<string, unknown>>(
    `select * from knowledge_documents where workspace_id = $1 and (id = $2 or public_id = $2)`,
    [DEMO_WORKSPACE_ID, id],
  );
  if (!rows[0]) throw new ApiError("not_found", "Document not found.", 404);
  const doc = mapDoc(rows[0]);
  const chunks = await sql.query<Record<string, unknown>>(
    `select * from knowledge_chunks where document_id = $1 order by ordinal`,
    [doc.id],
  );
  const events = await sql.query<Record<string, unknown>>(
    `select * from document_events where document_id = $1 order by created_at asc`,
    [doc.id],
  );
  const versions = [
    {
      version: doc.version,
      status: doc.status,
      indexedAt: doc.lastIndexedAt,
      note: "Current indexed version",
    },
  ];
  return {
    document: doc,
    chunks: chunks.map(mapChunk),
    events: events.map((e) => ({
      id: String(e.id),
      stage: String(e.stage),
      detail: String(e.detail),
      createdAt: iso(e.created_at),
    })),
    versions,
  };
}

export async function createTextDocument(input: {
  title: string;
  body: string;
  category: string;
  filename?: string;
}) {
  if (!input.title.trim() || !input.body.trim()) {
    throw new ApiError("validation_error", "Title and body are required.", 422);
  }
  await ensureSeeded();
  const sql = await getSql();
  const count = await sql.query<{ n: number }>(`select count(*)::int as n from knowledge_documents`);
  const id = rid("doc");
  const publicId = nextPublicId("DOC", (count[0]?.n ?? 0) + 21);
  const filename = sanitizeFilename(input.filename || `${slug(input.title)}.md`);
  await sql.query(
    `insert into knowledge_documents (
      id, workspace_id, public_id, title, category, version, source_type, status,
      chunk_count, last_indexed_at, owner_id, owner_name, usage_count, filename, body, failed_reason, suspicious
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [
      id,
      DEMO_WORKSPACE_ID,
      publicId,
      input.title.trim(),
      input.category || "policy",
      "1.0",
      "markdown",
      "pending",
      0,
      null,
      DEMO_OPERATOR_ID,
      "Elena Voss",
      0,
      filename,
      input.body,
      null,
      0,
    ],
  );
  await addEvent(id, "pending", "Document accepted");
  await indexDocument(id);
  await audit("document.created", "document", id, { publicId });
  return getDocument(id);
}

export async function uploadDocument(filename: string, mime: string, content: string, size: number) {
  const err = validateUpload(filename, mime, size);
  if (err) throw new ApiError("invalid_upload", err, 422);
  const extracted = await extractDocument(filename, content, mime);
  return createTextDocument({
    title: filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "),
    body: extracted.text,
    category: "policy",
    filename,
  });
}

export async function reindexDocument(id: string) {
  const doc = await getDocument(id);
  if (doc.document.status === "archived") {
    throw new ApiError("invalid_state", "Archived documents cannot be reindexed.", 409);
  }
  await indexDocument(doc.document.id);
  await audit("document.reindexed", "document", doc.document.id, {});
  return getDocument(doc.document.id);
}

export async function archiveDocument(id: string) {
  const doc = await getDocument(id);
  const sql = await getSql();
  await sql.query(`update knowledge_documents set status = 'archived' where id = $1 and workspace_id = $2`, [
    doc.document.id,
    DEMO_WORKSPACE_ID,
  ]);
  await addEvent(doc.document.id, "archived", "Archived by operator");
  await audit("document.archived", "document", doc.document.id, {});
  return getDocument(doc.document.id);
}

export async function testRetrieval(question: string) {
  if (!question.trim()) throw new ApiError("validation_error", "Enter a question to test retrieval.", 422);
  await ensureSeeded();
  const sql = await getSql();
  const docs = await sql.query<Record<string, unknown>>(
    `select * from knowledge_documents where workspace_id = $1 and status = 'ready'`,
    [DEMO_WORKSPACE_ID],
  );
  const chunks = await sql.query<Record<string, unknown>>(
    `select * from knowledge_chunks where workspace_id = $1`,
    [DEMO_WORKSPACE_ID],
  );
  const mappedDocs = docs.map(mapDoc);
  const mappedChunks = chunks.map(mapChunk).filter((c) => !c.flagged);
  const titleByDoc = new Map(mappedDocs.map((d) => [d.id, d.title]));
  const hits = rankEvidence(retrieve(question, mappedChunks, embedder, 8), titleByDoc, question);
  const runId = rid("run");
  await sql.query(
    `insert into retrieval_runs (id, workspace_id, ticket_id, query, created_at) values ($1,$2,$3,$4,$5)`,
    [runId, DEMO_WORKSPACE_ID, null, question, new Date().toISOString()],
  );
  return {
    query: question,
    runId,
    results: hits.map((h) => ({
      chunkId: h.chunk.id,
      documentId: h.chunk.documentId,
      documentTitle: titleByDoc.get(h.chunk.documentId) ?? "Unknown",
      section: h.chunk.section,
      excerpt: h.chunk.text.slice(0, 500),
      score: Math.round(h.score * 1000) / 1000,
      cosine: Math.round(h.cosine * 1000) / 1000,
      lexical: Math.round(h.lexical * 1000) / 1000,
      flagged: h.chunk.flagged,
    })),
  };
}

async function indexDocument(id: string) {
  const sql = await getSql();
  const rows = await sql.query<Record<string, unknown>>(
    `select * from knowledge_documents where id = $1 and workspace_id = $2`,
    [id, DEMO_WORKSPACE_ID],
  );
  const doc = rows[0];
  if (!doc) throw new ApiError("not_found", "Document not found.", 404);
  if (!String(doc.body ?? "").trim()) {
    await sql.query(
      `update knowledge_documents set status = 'failed', failed_reason = $1 where id = $2`,
      ["No extractable text.", id],
    );
    await addEvent(id, "failed", "No extractable text");
    return;
  }
  await sql.query(`update knowledge_documents set status = 'extracting' where id = $1`, [id]);
  await addEvent(id, "extracting", "Text extracted");
  await sql.query(`update knowledge_documents set status = 'chunking' where id = $1`, [id]);
  const chunks = chunkDocument(String(doc.body));
  await addEvent(id, "chunking", `${chunks.length} chunks`);
  await sql.query(`update knowledge_documents set status = 'embedding' where id = $1`, [id]);
  await sql.query(`delete from knowledge_chunks where document_id = $1`, [id]);
  let flagged = 0;
  for (const chunk of chunks) {
    const inj = detectPromptInjection(chunk.text);
    if (inj.matched) flagged += 1;
    await sql.query(
      `insert into knowledge_chunks (
        id, document_id, workspace_id, ordinal, section, page, text, embedding, token_count, flagged, flag_reason
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        rid("chk"),
        id,
        DEMO_WORKSPACE_ID,
        chunk.ordinal,
        chunk.section,
        chunk.page,
        chunk.text,
        JSON.stringify(embedder.embed(chunk.text)),
        chunk.tokenCount,
        inj.matched ? 1 : 0,
        inj.matched ? `Prompt-injection patterns: ${inj.patterns.join(", ")}` : null,
      ],
    );
  }
  const now = new Date().toISOString();
  await sql.query(
    `update knowledge_documents set status = 'ready', chunk_count = $1, last_indexed_at = $2, failed_reason = null where id = $3`,
    [chunks.length, now, id],
  );
  await addEvent(
    id,
    "ready",
    flagged ? `Indexed with ${flagged} flagged chunk(s) excluded from answers` : "Indexed",
  );
}

async function addEvent(documentId: string, stage: string, detail: string) {
  const sql = await getSql();
  await sql.query(
    `insert into document_events (id, document_id, stage, detail, created_at) values ($1,$2,$3,$4,$5)`,
    [rid("dov"), documentId, stage, detail, new Date().toISOString()],
  );
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export type { KnowledgeDocument, KnowledgeChunk };
