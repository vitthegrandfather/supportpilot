import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PriorityBadge, SlaBadge, StatusBadge } from "@/components/status";
import { categoryLabel, confidenceTone } from "@/components/status-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/input";
import {
  addNoteFn,
  approveDraftFn,
  editDraftFn,
  escalateTicketFn,
  generateDraftFn,
  getTicketFn,
  listOperatorsFn,
  patchTicketFn,
  sendDraftFn,
} from "@/lib/pilot/api";
import { PIPELINE_STAGES } from "@/lib/pilot/rag/pipeline";
import type { ReplyDraft } from "@/lib/pilot/types";
import { ApiError } from "@/lib/pilot/errors";
import { cn, formatDateTime } from "@/lib/utils";

export const Route = createFileRoute("/_app/inbox/$ticketId")({
  component: TicketWorkspace,
});

function TicketWorkspace() {
  const { ticketId } = Route.useParams();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["ticket", ticketId],
    queryFn: () => getTicketFn({ data: { ticketId } }),
  });
  const { data: operators = [] } = useQuery({
    queryKey: ["operators"],
    queryFn: () => listOperatorsFn(),
  });

  const [pane, setPane] = useState<"thread" | "ai">("thread");
  const [draftText, setDraftText] = useState("");
  const [note, setNote] = useState("");
  const [stageIdx, setStageIdx] = useState(-1);
  const [citation, setCitation] = useState<ReplyDraft["citations"][number] | null>(null);

  const draft = data?.drafts[0] as ReplyDraft | undefined;
  const draftId = draft?.id;
  const draftUpdatedAt = draft?.updatedAt;
  const draftBody = draft?.body;
  useEffect(() => {
    if (draftBody !== undefined) setDraftText(draftBody);
  }, [draftId, draftUpdatedAt, draftBody]);

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ["ticket", ticketId] });
    await qc.invalidateQueries({ queryKey: ["tickets"] });
    await qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const generate = useMutation({
    mutationFn: async () => {
      setStageIdx(0);
      const timers: number[] = [];
      for (let i = 1; i < PIPELINE_STAGES.length; i += 1) {
        timers.push(window.setTimeout(() => setStageIdx(i), i * 420));
      }
      try {
        return await generateDraftFn({ data: { ticketId } });
      } finally {
        timers.forEach((t) => window.clearTimeout(t));
        setStageIdx(PIPELINE_STAGES.length - 1);
      }
    },
    onSuccess: async (res) => {
      await invalidate();
      setDraftText(res.draft.body);
      toast.message("Draft generated from retrieved sources.");
      if (res.draft.insufficientEvidence) {
        toast.message("Evidence is insufficient. Escalation recommended.");
      }
    },
    onError: (e) => toast.error(errMsg(e)),
    onSettled: () => setTimeout(() => setStageIdx(-1), 600),
  });

  const saveEdit = useMutation({
    mutationFn: () => editDraftFn({ data: { ticketId, draftId: draft!.id, body: draftText } }),
    onSuccess: invalidate,
    onError: (e) => toast.error(errMsg(e)),
  });
  const approve = useMutation({
    mutationFn: () => approveDraftFn({ data: { ticketId, draftId: draft!.id } }),
    onSuccess: async () => {
      await invalidate();
      toast.success("Draft approved. Simulated send is now available.");
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const send = useMutation({
    mutationFn: () => sendDraftFn({ data: { ticketId, draftId: draft!.id } }),
    onSuccess: async () => {
      await invalidate();
      toast.success("Simulated reply recorded. No email provider was contacted.");
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const patch = useMutation({
    mutationFn: (p: { status?: string; priority?: string; assigneeId?: string | null }) =>
      patchTicketFn({ data: { ticketId, ...p } }),
    onSuccess: invalidate,
  });
  const noteMut = useMutation({
    mutationFn: () => addNoteFn({ data: { ticketId, body: note } }),
    onSuccess: async () => {
      setNote("");
      await invalidate();
      toast.success("Internal note added.");
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const escMut = useMutation({
    mutationFn: () =>
      escalateTicketFn({
        data: { ticketId, reason: draft?.escalateReason || "Operator requested escalation." },
      }),
    onSuccess: async () => {
      await invalidate();
      toast.success("Ticket escalated.");
    },
  });

  if (isLoading || !data) {
    return <div className="p-6 text-sm text-ink-muted">{error ? errMsg(error) : "Loading ticket…"}</div>;
  }

  const { ticket, customer, messages, notes, audit, safetyEvents = [] } = data;
  const timeline = [
    ...messages.map((m) => ({ kind: "message" as const, at: m.createdAt, m })),
    ...notes.map((n) => ({ kind: "note" as const, at: n.createdAt, n })),
  ].sort((a, b) => +new Date(a.at) - +new Date(b.at));

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col border-r border-line">
        <header className="border-b border-line bg-surface px-4 py-3">
          <div className="mb-2 flex items-center gap-2 lg:hidden">
            <Link to="/inbox" className="inline-flex items-center gap-1 text-xs text-ink-muted">
              <ArrowLeft className="size-3.5" /> Inbox
            </Link>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-ink-subtle">{ticket.publicId}</span>
                <StatusBadge status={ticket.status} />
                <PriorityBadge priority={ticket.priority} />
                <SlaBadge state={ticket.slaState} />
              </div>
              <h2 className="mt-1 text-base font-semibold">{ticket.subject}</h2>
              <p className="text-xs text-ink-muted">
                {customer.name} · {customer.company} · {ticket.channel} · {categoryLabel(ticket.category)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Select
                value={ticket.status}
                onChange={(e) => patch.mutate({ status: e.target.value })}
                aria-label="Status"
              >
                <option value="new">New</option>
                <option value="in_progress">In progress</option>
                <option value="waiting">Waiting for customer</option>
                <option value="resolved">Resolved</option>
                <option value="escalated">Escalated</option>
              </Select>
              <Select
                value={ticket.priority}
                onChange={(e) => patch.mutate({ priority: e.target.value })}
                aria-label="Priority"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </Select>
              <Select
                value={ticket.assigneeId ?? ""}
                onChange={(e) => patch.mutate({ assigneeId: e.target.value || null })}
                aria-label="Assignee"
              >
                <option value="">Unassigned</option>
                {operators.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="mt-3 flex gap-2 lg:hidden">
            <Button size="sm" variant={pane === "thread" ? "navy" : "secondary"} onClick={() => setPane("thread")}>
              Conversation
            </Button>
            <Button size="sm" variant={pane === "ai" ? "navy" : "secondary"} onClick={() => setPane("ai")}>
              Analysis
            </Button>
          </div>
        </header>

        <div className={cn("min-h-0 flex-1 overflow-auto p-4", pane === "ai" && "hidden lg:block")}>
          <ol className="space-y-3">
            {timeline.map((item) =>
              item.kind === "note" ? (
                <li key={item.n.id} className="rounded-[var(--radius-md)] border border-dashed border-line bg-amber-soft/40 px-3 py-2">
                  <div className="text-[11px] font-medium text-amber">Internal note · {item.n.authorName}</div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{item.n.body}</p>
                  <div className="mt-1 text-[11px] text-ink-subtle">{formatDateTime(item.n.createdAt)}</div>
                </li>
              ) : (
                <li
                  key={item.m.id}
                  className={cn(
                    "rounded-[var(--radius-md)] px-3 py-2 shadow-[var(--shadow-border)]",
                    item.m.authorType === "customer" ? "bg-paper-2" : "bg-surface",
                    item.m.simulated && "border border-teal/40",
                  )}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-medium">
                      {item.m.authorName}
                      <span className="ml-2 font-normal text-ink-subtle">{item.m.authorType}</span>
                      {item.m.simulated ? (
                        <Badge tone="teal" className="ml-2">
                          Simulated send
                        </Badge>
                      ) : null}
                    </span>
                    <span className="text-ink-subtle">
                      {item.m.channel} · {formatDateTime(item.m.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{item.m.body}</p>
                </li>
              ),
            )}
          </ol>
        </div>

        <footer className={cn("border-t border-line bg-surface p-3", pane === "ai" && "hidden lg:block")}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-medium text-ink-muted">Reply composer</div>
            <div className="flex flex-wrap gap-1">
              {draft ? <DraftStateBadge state={draft.state} /> : <Badge>No draft</Badge>}
            </div>
          </div>
          {stageIdx >= 0 ? (
            <ol className="mb-2 grid grid-cols-2 gap-1 md:grid-cols-3">
              {PIPELINE_STAGES.map((s, i) => (
                <li
                  key={s.id}
                  className={cn(
                    "rounded-[var(--radius-xs)] px-2 py-1 text-[11px]",
                    i < stageIdx && "bg-ok-soft text-ok",
                    i === stageIdx && "bg-teal-soft text-teal-ink",
                    i > stageIdx && "bg-paper-2 text-ink-subtle",
                  )}
                >
                  {i + 1}. {s.label}
                </li>
              ))}
            </ol>
          ) : null}
          <Textarea
            rows={8}
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            placeholder="Generate a grounded draft, then edit here before approval."
          />
          {draft ? (
            <CitationBar draft={draft} onOpen={setCitation} />
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => generate.mutate()} disabled={generate.isPending}>
              {generate.isPending ? "Generating…" : "Generate draft"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!draft || draftText === draft.body || saveEdit.isPending}
              onClick={() => saveEdit.mutate()}
            >
              Save edit
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={
                !draft ||
                draft.state === "simulated_sent" ||
                draft.state === "blocked" ||
                draft.insufficientEvidence ||
                approve.isPending
              }
              onClick={() => approve.mutate()}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="navy"
              disabled={!draft || draft.state !== "approved" || send.isPending}
              onClick={() => send.mutate()}
            >
              Send simulated reply
            </Button>
            <Button size="sm" variant="ghost" onClick={() => escMut.mutate()}>
              Escalate
            </Button>
            <Button size="sm" variant="ghost" onClick={() => patch.mutate({ status: "resolved" })}>
              Resolve
            </Button>
            {ticket.status === "resolved" ? (
              <Button size="sm" variant="ghost" onClick={() => patch.mutate({ status: "in_progress" })}>
                Reopen
              </Button>
            ) : null}
          </div>
          <p className="mt-2 text-[11px] text-ink-subtle">
            Send records a simulated operator reply in this workspace only. It never contacts email or chat providers.
          </p>
          <div className="mt-3 border-t border-line pt-3">
            <div className="text-xs font-medium text-ink-muted">Internal note</div>
            <Textarea rows={2} className="mt-1" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button size="sm" variant="secondary" className="mt-2" disabled={!note.trim()} onClick={() => noteMut.mutate()}>
              Add internal note
            </Button>
          </div>
        </footer>
      </div>

      <aside className={cn("w-full shrink-0 overflow-auto bg-paper lg:w-[340px]", pane === "thread" && "hidden lg:block")}>
        <AnalysisPanel
          ticket={ticket}
          customer={customer}
          draft={draft}
          audit={audit}
          safetyEvents={safetyEvents}
          onOpenCitation={setCitation}
        />
      </aside>

      {citation ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
          <div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-[var(--radius-lg)] bg-surface p-5 shadow-[var(--shadow-panel)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-medium text-ink-muted">Source [{citation.marker}]</div>
                <h3 className="text-base font-semibold">{citation.documentTitle}</h3>
                <p className="text-xs text-ink-muted">
                  {citation.section} · retrieval score {citation.score.toFixed(3)}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setCitation(null)}>
                Close
              </Button>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{citation.excerpt}</p>
            {citation.flagged ? (
              <p className="mt-3 text-sm text-danger">This passage was flagged and excluded from the answer.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DraftStateBadge({ state }: { state: ReplyDraft["state"] }) {
  const map: Record<ReplyDraft["state"], { label: string; tone: "teal" | "amber" | "green" | "navy" | "red" }> = {
    generated: { label: "AI-generated draft", tone: "teal" },
    edited: { label: "Human-edited draft", tone: "amber" },
    approved: { label: "Approved reply", tone: "green" },
    simulated_sent: { label: "Simulated sent reply", tone: "navy" },
    blocked: { label: "Blocked — insufficient evidence", tone: "red" },
  };
  const m = map[state];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

function CitationBar({
  draft,
  onOpen,
}: {
  draft: ReplyDraft;
  onOpen: (c: ReplyDraft["citations"][number]) => void;
}) {
  if (!draft.citations.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {draft.citations.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onOpen(c)}
          className="rounded-[var(--radius-xs)] border border-line bg-paper px-1.5 py-0.5 text-[11px] hover:border-teal"
        >
          [{c.marker}] {c.documentTitle}
        </button>
      ))}
    </div>
  );
}

function AnalysisPanel({
  ticket,
  customer,
  draft,
  audit,
  safetyEvents,
  onOpenCitation,
}: {
  ticket: { slaDeadlineAt: string; tags: string[]; channel: string };
  customer: { name: string; email: string; company: string; plan: string; region: string; accountId: string; health: string };
  draft?: ReplyDraft;
  audit: { id: string; actorName: string; action: string; createdAt: string }[];
  safetyEvents: { id: string; type: string; detail: string }[];
  onOpenCitation: (c: ReplyDraft["citations"][number]) => void;
}) {
  const cls = draft?.classification;
  return (
    <div className="space-y-4 p-4">
      <section className="rounded-[var(--radius-md)] bg-surface p-3 shadow-[var(--shadow-border)]">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Customer</h3>
        <dl className="mt-2 space-y-1 text-sm">
          <Row k="Name" v={customer.name} />
          <Row k="Company" v={customer.company} />
          <Row k="Email" v={customer.email} />
          <Row k="Plan" v={customer.plan} />
          <Row k="Account" v={customer.accountId} />
          <Row k="Region" v={customer.region} />
          <Row k="Health" v={customer.health} />
          <Row k="SLA deadline" v={formatDateTime(ticket.slaDeadlineAt)} />
          <Row k="Tags" v={ticket.tags.join(", ") || "—"} />
        </dl>
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface p-3 shadow-[var(--shadow-border)]">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">AI analysis</h3>
        {cls ? (
          <dl className="mt-2 space-y-1 text-sm">
            <Row k="Category" v={categoryLabel(cls.category)} />
            <Row k="Sentiment" v={cls.sentiment} />
            <Row k="Urgency" v={cls.urgency} />
            <Row k="Suggested priority" v={cls.suggestedPriority} />
            <div className="flex items-center justify-between gap-2 py-0.5">
              <dt className="text-ink-muted">Confidence</dt>
              <dd>
                <Badge tone={confidenceTone(draft!.confidence)}>{draft!.confidence.toFixed(2)}</Badge>
              </dd>
            </div>
            <Row k="Escalate" v={draft!.escalate ? "Yes" : "No"} />
          </dl>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">Generate a draft to classify this ticket and retrieve sources.</p>
        )}
        {cls?.reasoning ? <p className="mt-2 text-xs leading-5 text-ink-muted">{cls.reasoning}</p> : null}
        {cls?.safetyFlags?.length ? (
          <ul className="mt-2 space-y-1">
            {cls.safetyFlags.map((f) => (
              <li key={f}>
                <Badge tone="red">{f.replace(/_/g, " ")}</Badge>
              </li>
            ))}
          </ul>
        ) : null}
        {draft?.escalateReason ? (
          <p className="mt-2 text-xs text-amber">{draft.escalateReason}</p>
        ) : null}
        {draft?.insufficientEvidence ? (
          <p className="mt-2 text-xs text-danger">
            Evidence is insufficient. The system will not invent policy details.
          </p>
        ) : null}
        {safetyEvents.length ? (
          <ul className="mt-2 space-y-1">
            {safetyEvents.map((ev) => (
              <li key={ev.id} className="text-xs text-danger">
                <span className="font-medium">{ev.type.replace(/_/g, " ")}</span>: {ev.detail}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface p-3 shadow-[var(--shadow-border)]">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Retrieved sources</h3>
        {draft?.citations.length ? (
          <ul className="mt-2 space-y-2">
            {draft.citations.map((c) => (
              <li key={c.id}>
                <button type="button" className="text-left text-sm hover:underline" onClick={() => onOpenCitation(c)}>
                  [{c.marker}] {c.documentTitle}
                </button>
                <div className="text-[11px] text-ink-subtle">
                  {c.section} · score {c.score.toFixed(3)}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">No sources yet.</p>
        )}
        {draft?.knowledgeGaps.length ? (
          <div className="mt-3">
            <div className="text-[11px] font-medium uppercase text-ink-muted">Knowledge gaps</div>
            <ul className="mt-1 list-disc pl-4 text-xs text-ink">
              {draft.knowledgeGaps.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface p-3 shadow-[var(--shadow-border)]">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Audit trail</h3>
        <ul className="mt-2 space-y-2">
          {audit.length === 0 ? <li className="text-sm text-ink-muted">No events yet.</li> : null}
          {audit.map((a) => (
            <li key={a.id} className="text-xs">
              <span className="font-medium">{a.actorName}</span> {a.action}
              <div className="text-ink-subtle">{formatDateTime(a.createdAt)}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <dt className="text-ink-muted">{k}</dt>
      <dd className="text-right capitalize">{v}</dd>
    </div>
  );
}

function errMsg(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as Error).message);
  return "Request failed.";
}
