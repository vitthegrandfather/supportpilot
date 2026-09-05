import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageFrame } from "@/routes/_app/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { createDocumentFn, listDocumentsFn, retrieveTestFn, uploadDocumentFn } from "@/lib/pilot/api";
import { formatDateTime } from "@/lib/utils";

export const Route = createFileRoute("/_app/knowledge/")({
  component: KnowledgePage,
});

function KnowledgePage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [question, setQuestion] = useState("How do we reverse a duplicate annual-plan charge?");
  const [hits, setHits] = useState<Awaited<ReturnType<typeof retrieveTestFn>> | null>(null);

  const { data: docs = [] } = useQuery({
    queryKey: ["docs", q, category, status],
    queryFn: () => listDocumentsFn({ data: { q, category, status } }),
  });

  const create = useMutation({
    mutationFn: () => createDocumentFn({ data: { title, body, category: "policy" } }),
    onSuccess: async () => {
      setTitle("");
      setBody("");
      await qc.invalidateQueries({ queryKey: ["docs"] });
      toast.success("Document indexed.");
    },
    onError: (e) => toast.error(String((e as Error).message)),
  });

  const retrieve = useMutation({
    mutationFn: () => retrieveTestFn({ data: { question } }),
    onSuccess: setHits,
    onError: (e) => toast.error(String((e as Error).message)),
  });

  const statusTone = (s: string) => {
    if (s === "ready") return "green" as const;
    if (s === "failed") return "red" as const;
    if (s === "archived") return "neutral" as const;
    return "amber" as const;
  };

  return (
    <PageFrame
      title="Knowledge base"
      subtitle="Indexed HelioDesk policies. Retrieval uses the sandbox embedding provider — no hosted model is called."
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Search documents" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="all">All categories</option>
          <option value="billing">Billing</option>
          <option value="security">Security</option>
          <option value="privacy">Privacy</option>
          <option value="policy">Policy</option>
          <option value="product">Product</option>
          <option value="runbook">Runbook</option>
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="ready">Ready</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
          <option value="archived">Archived</option>
        </Select>
      </div>

      <div className="overflow-auto rounded-[var(--radius-lg)] bg-surface shadow-[var(--shadow-border)]">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-line bg-paper text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Document</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Version</th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Chunks</th>
              <th className="px-3 py-2 font-medium">Indexed</th>
              <th className="px-3 py-2 font-medium">Owner</th>
              <th className="px-3 py-2 font-medium">Uses</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id} className="border-b border-line last:border-0">
                <td className="px-3 py-2">
                  <Link to="/knowledge/$documentId" params={{ documentId: d.id }} className="font-medium text-teal-ink hover:underline">
                    {d.title}
                  </Link>
                  <div className="font-mono text-[11px] text-ink-subtle">{d.publicId}</div>
                </td>
                <td className="px-3 py-2 capitalize">{d.category}</td>
                <td className="px-3 py-2 font-mono">{d.version}</td>
                <td className="px-3 py-2 uppercase">{d.sourceType}</td>
                <td className="px-3 py-2">
                  <Badge tone={statusTone(d.status)}>{d.status}</Badge>
                </td>
                <td className="px-3 py-2 font-mono tabular-nums">{d.chunkCount}</td>
                <td className="px-3 py-2 text-xs">{d.lastIndexedAt ? formatDateTime(d.lastIndexedAt) : "—"}</td>
                <td className="px-3 py-2">{d.ownerName}</td>
                <td className="px-3 py-2 font-mono tabular-nums">{d.usageCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-border)]">
          <h2 className="text-sm font-semibold">Add text document</h2>
          <p className="mt-1 text-xs text-ink-muted">Paste policy text. Production extractors accept PDF, DOCX, TXT, Markdown, and HTML.</p>
          <Input className="mt-3" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea className="mt-2" rows={8} placeholder="Policy body" value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={!title.trim() || !body.trim() || create.isPending} onClick={() => create.mutate()}>
              Index document
            </Button>
            <label className="text-xs text-ink-muted">
              <input
                type="file"
                accept=".txt,.md,.markdown,.html,.htm"
                className="text-xs"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const text = await file.text();
                  try {
                    await uploadDocumentFn({
                      data: { filename: file.name, mime: file.type || "text/plain", content: text, size: file.size },
                    });
                    await qc.invalidateQueries({ queryKey: ["docs"] });
                    toast.success("Upload indexed.");
                  } catch (err) {
                    toast.error(String((err as Error).message));
                  }
                }}
              />
              Upload TXT / Markdown / HTML
            </label>
          </div>
        </section>

        <section className="rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-border)]">
          <h2 className="text-sm font-semibold">Retrieval test</h2>
          <p className="mt-1 text-xs text-ink-muted">Inspect ranked chunks, similarity, and excerpts without generating a customer reply.</p>
          <Textarea className="mt-3" rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} />
          <Button size="sm" className="mt-2" onClick={() => retrieve.mutate()} disabled={retrieve.isPending}>
            Run retrieval
          </Button>
          <ul className="mt-3 space-y-2">
            {hits?.results.map((h) => (
              <li key={h.chunkId} className="rounded-[var(--radius-sm)] bg-paper p-2 text-sm">
                <div className="font-medium">
                  {h.documentTitle} · {h.section}
                </div>
                <div className="font-mono text-[11px] text-ink-subtle">
                  score {h.score.toFixed(3)} · cosine {h.cosine.toFixed(3)} · lexical {h.lexical.toFixed(3)}
                </div>
                <p className="mt-1 text-xs leading-5 text-ink-muted">{h.excerpt}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PageFrame>
  );
}
