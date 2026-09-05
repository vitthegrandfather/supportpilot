import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { PageFrame } from "@/routes/_app/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { archiveDocumentFn, getDocumentFn, reindexDocumentFn } from "@/lib/pilot/api";
import { formatDateTime } from "@/lib/utils";

export const Route = createFileRoute("/_app/knowledge/$documentId")({
  component: DocumentDetailPage,
});

function DocumentDetailPage() {
  const { documentId } = Route.useParams();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["document", documentId],
    queryFn: () => getDocumentFn({ data: { documentId } }),
  });

  const reindex = useMutation({
    mutationFn: () => reindexDocumentFn({ data: { documentId } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["document", documentId] });
      await qc.invalidateQueries({ queryKey: ["docs"] });
      toast.success("Reindex complete.");
    },
    onError: (e) => toast.error(String((e as Error).message)),
  });
  const archive = useMutation({
    mutationFn: () => archiveDocumentFn({ data: { documentId } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["document", documentId] });
      await qc.invalidateQueries({ queryKey: ["docs"] });
      toast.success("Document archived.");
    },
    onError: (e) => toast.error(String((e as Error).message)),
  });

  if (isLoading || !data) {
    return <PageFrame title="Document">{error ? <p className="text-danger">{String((error as Error).message)}</p> : <p>Loading…</p>}</PageFrame>;
  }
  const { document: d, chunks, events, versions } = data;

  return (
    <PageFrame
      title={d.title}
      subtitle={`${d.publicId} · ${d.filename} · owner ${d.ownerName}`}
      actions={
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => reindex.mutate()} disabled={reindex.isPending}>
            Reindex
          </Button>
          <Button size="sm" variant="ghost" onClick={() => archive.mutate()} disabled={d.status === "archived"}>
            Archive
          </Button>
        </div>
      }
    >
      <p className="mb-4 text-sm">
        <Link to="/knowledge" className="text-teal-ink hover:underline">
          Back to knowledge base
        </Link>
      </p>
      <div className="grid gap-4 lg:grid-cols-3">
        <dl className="rounded-[var(--radius-lg)] bg-surface p-4 text-sm shadow-[var(--shadow-border)]">
          <Item k="Status" v={d.status} />
          <Item k="Category" v={d.category} />
          <Item k="Version" v={d.version} />
          <Item k="Source type" v={d.sourceType} />
          <Item k="Chunks" v={String(d.chunkCount)} />
          <Item k="Retrieval uses" v={String(d.usageCount)} />
          <Item k="Last indexed" v={d.lastIndexedAt ? formatDateTime(d.lastIndexedAt) : "—"} />
          {d.failedReason ? <Item k="Failure" v={d.failedReason} /> : null}
          {d.suspicious ? (
            <div className="mt-2">
              <Badge tone="red">Untrusted source — injection scan required</Badge>
            </div>
          ) : null}
        </dl>
        <section className="lg:col-span-2 rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-border)]">
          <h2 className="text-sm font-semibold">Processing events</h2>
          <ol className="mt-2 space-y-1 text-sm">
            {events.map((e) => (
              <li key={e.id}>
                <span className="font-mono text-xs text-ink-subtle">{formatDateTime(e.createdAt)}</span>{" "}
                <span className="font-medium">{e.stage}</span> — {e.detail}
              </li>
            ))}
          </ol>
          <h2 className="mt-4 text-sm font-semibold">Version history</h2>
          <ul className="mt-2 text-sm">
            {versions.map((v) => (
              <li key={v.version}>
                v{v.version} · {v.status} · {v.note}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-4 rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-border)]">
        <h2 className="text-sm font-semibold">Extracted text</h2>
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs leading-5 text-ink">{d.body || "No extracted text."}</pre>
      </section>

      <section className="mt-4 rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-border)]">
        <h2 className="text-sm font-semibold">Chunks</h2>
        <ul className="mt-3 space-y-3">
          {chunks.map((c) => (
            <li key={c.id} className="rounded-[var(--radius-md)] border border-line p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono">#{c.ordinal}</span>
                <span>{c.section}</span>
                {c.page ? <span>p.{c.page}</span> : null}
                <span className="text-ink-subtle">{c.tokenCount} tokens</span>
                {c.flagged ? <Badge tone="red">Flagged</Badge> : null}
              </div>
              {c.flagReason ? <p className="mt-1 text-xs text-danger">{c.flagReason}</p> : null}
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{c.text}</p>
            </li>
          ))}
        </ul>
      </section>
    </PageFrame>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 py-1">
      <dt className="text-ink-muted">{k}</dt>
      <dd className="text-right capitalize">{v}</dd>
    </div>
  );
}
