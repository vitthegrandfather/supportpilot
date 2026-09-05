import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { PageFrame } from "@/routes/_app/dashboard";

export const Route = createFileRoute("/_app/architecture")({
  component: ArchitecturePage,
});

const FLOW = [
  "Ticket intake",
  "Validation",
  "Classification",
  "Knowledge retrieval",
  "Evidence ranking",
  "Response generation",
  "Citation verification",
  "Confidence gate",
  "Human approval",
  "Simulated delivery",
  "Audit log",
];

function ArchitecturePage() {
  return (
    <PageFrame
      title="Architecture"
      subtitle="How SupportPilot turns an inbound ticket into a grounded, cited, human-approved reply."
    >
      <ol className="flex flex-wrap gap-2">
        {FLOW.map((step, i) => (
          <li key={step} className="flex items-center gap-2">
            <span className="rounded-[var(--radius-sm)] bg-navy px-3 py-2 text-xs font-medium text-surface">
              {i + 1}. {step}
            </span>
            {i < FLOW.length - 1 ? <span className="text-ink-subtle">→</span> : null}
          </li>
        ))}
      </ol>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card title="API layer">
          REST and server functions expose tickets, drafts, knowledge, analytics, health, and demo reset.
          Errors use a stable envelope with code, message, and request_id. Pagination is limit/offset on list
          endpoints in the production FastAPI service.
        </Card>
        <Card title="Background workers">
          Celery + Redis run extraction, chunking, embedding, reindex, draft generation, and retryable simulated
          delivery. The live preview runs the same stages in-process with explicit job states so a failed ingest
          keeps its reason.
        </Card>
        <Card title="PostgreSQL + pgvector">
          Tickets, documents, drafts, and audit events live in Postgres. Production stores chunk embeddings in
          pgvector; this preview uses a deterministic hash embedding stored as JSON so it runs without extensions.
        </Card>
        <Card title="Redis">
          Queue broker, rate-limit counters, and short-lived job state. Preview rate limits are an in-memory sliding
          window with the same error code.
        </Card>
        <Card title="Document storage">
          An object-storage abstraction accepts PDF, DOCX, TXT, Markdown, and HTML. Filename sanitization, MIME
          checks, and an 8 MB cap happen before extraction. Binary PDF/DOCX extractors are interfaces; the demo
          indexes text formats and records failed encrypted PDFs.
        </Card>
        <Card title="Model-provider abstraction">
          EmbeddingProvider and GenerationProvider sit behind sandbox implementations (hash embeddings + extractive
          drafting). Hosted adapters exist as types only and throw if constructed without credentials. Preview never
          calls a paid model.
        </Card>
        <Card title="Observability">
          Structured JSON logs, request IDs, audit events, document processing events, and safety events for prompt
          injection. Secrets and obvious credential patterns are redacted before log write.
        </Card>
        <Card title="Security controls">
          Untrusted customer text and indexed documents. Prompt-injection detection, HTML escaping, workspace
          isolation, role checks in the FastAPI artifact, citation validation, confidence thresholds, and a human
          approval gate before any send. Send is simulated in this workspace.
        </Card>
      </div>

      <section className="mt-6 rounded-[var(--radius-lg)] bg-surface p-5 shadow-[var(--shadow-border)]">
        <h2 className="text-sm font-semibold">Confidence gate</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink">
          <li>Below 0.55: escalate; do not treat the draft as sendable without a specialist.</li>
          <li>0.55–0.86: operator edit expected.</li>
          <li>0.86 and above: still requires human approve + simulated send.</li>
          <li>Insufficient evidence: refuse to invent policy, recommend escalation, keep the draft blocked.</li>
        </ul>
      </section>
    </PageFrame>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-border)]">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-ink-muted">{children}</p>
    </article>
  );
}
