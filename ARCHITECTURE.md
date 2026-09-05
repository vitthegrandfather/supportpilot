# SupportPilot architecture

SupportPilot is a grounded support workspace: retrieval, citation, confidence, and a human send gate. The live preview runs the same pipeline with sandbox providers. `backend/` is the production-oriented FastAPI artifact.

## Domain model

| Entity | Purpose |
| --- | --- |
| Workspace | Tenant boundary (demo: HelioDesk Support) |
| User / Operator | Admin or operator |
| Customer | Fictional requester + account context |
| Ticket | Public ID `TKT-2026-#####`, SLA, status, priority |
| ConversationMessage | Customer, operator, or system; `simulated` marks fake sends |
| InternalNote | Operator-only |
| KnowledgeDocument | Policy/runbook with processing status |
| KnowledgeChunk | Section, page, embedding, injection flag |
| RetrievalRun | Query + ranked hits |
| RetrievedCitation | Marker `[n]`, excerpt, score |
| ReplyDraft | generated / edited / approved / simulated_sent / blocked |
| Escalation | Queue + reason |
| AuditEvent | Who did what to which entity |
| ProviderConfiguration | Sandbox vs future hosted adapters |

## RAG pipeline

```text
Ticket intake
  → validation (size, MIME, workspace, untrusted text)
  → classification (category, sentiment, urgency, priority, safety flags)
  → knowledge retrieval (sandbox embeddings + lexical fallback)
  → evidence ranking (diversity by document/section)
  → response generation (extractive, citation markers)
  → citation verification (uncited sentences flagged)
  → confidence gate
  → human approval
  → simulated delivery
  → audit log
```

Chunking defaults: 500–800 tokens, 80–120 token overlap, preserve title/section/version/page.

### Provider abstraction

```text
EmbeddingProvider
  SandboxEmbeddingProvider   # deterministic 256-d hashed n-grams
  OpenAIEmbeddingAdapter     # raises without credentials; unused in preview/tests

GenerationProvider
  SandboxGenerationProvider  # extractive composition from retrieved sentences
  OpenAIGenerationAdapter    # raises without credentials; unused in preview/tests
```

The default configuration is sandbox-only.

## Async processing

Celery + Redis (Python artifact):

- document extraction, chunking, embedding, reindex
- draft generation
- retryable simulated delivery

Jobs expose explicit states. Failures keep their reason (see the failed encrypted PDF in the knowledge base). The preview executes the same stages in-process so the live product works without Redis.

## Confidence gate

| Score | Behaviour |
| --- | --- |
| < 0.55 | Escalate; do not treat as sendable |
| 0.55–0.86 | Operator edit expected |
| ≥ 0.86 | Still requires Approve + simulated send |
| Insufficient evidence | Block invention of policy; recommend escalation |

Security-sensitive and ownership-change requests are capped and routed to Trust & Safety regardless of retrieval score.

## Citation verification

Every generated draft maps markers to retrieved chunks. Opening a marker shows document title, section, excerpt, and score. Sentences that cannot be associated with evidence are flagged before approval.

## Security boundaries

- Untrusted customer input and untrusted indexed documents
- Prompt-injection detection; hostile chunks excluded
- HTML escaping, filename sanitization, MIME allow-list, 8 MB upload cap
- Workspace isolation on every query
- Rate limiting on generate/mutate
- JWT auth + role checks in FastAPI (`admin` vs `operator`)
- Secret redaction and PII-aware logging
- Audit events for generate, edit, approve, send, escalate, reindex, reset
- No tool execution from document text
- No secrets in frontend bundles
- CSV formula-injection prefixing

The browser preview auto-enters a demo session. FastAPI tests authenticate explicitly.

## Production extension points

1. Swap `SandboxEmbeddingProvider` for a hosted embedding API behind the same interface; store vectors in pgvector.
2. Swap `SandboxGenerationProvider` for a constrained LLM that receives only ranked excerpts, never raw tool access.
3. Replace simulated delivery with an email/chat adapter that still requires `approved` state.
4. Turn Celery tasks on for ingest at volume.
5. Attach OpenTelemetry around retrieval runs and confidence distributions.
6. Partition object storage per workspace.

## Preview vs artifact

| Concern | Live preview | FastAPI artifact |
| --- | --- | --- |
| HTTP | TanStack server functions + `/api/v1` | FastAPI `/api/v1` |
| DB | PGLite / Neon | PostgreSQL + Alembic |
| Vectors | JSON + cosine in process | JSON in tests; pgvector in Docker |
| Queue | In-process stages | Celery + Redis |
| Auth | Auto demo operator | JWT, roles |
