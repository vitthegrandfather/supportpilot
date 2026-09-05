import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { PageFrame } from "@/routes/_app/dashboard";
import { Button } from "@/components/ui/button";
import { getSessionFn, resetDemoFn } from "@/lib/pilot/api";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["session"], queryFn: () => getSessionFn() });
  const reset = useMutation({
    mutationFn: () => resetDemoFn(),
    onSuccess: async () => {
      await qc.invalidateQueries();
      toast.success("Demo data restored to the original fictional dataset.");
    },
    onError: (e) => toast.error(String((e as Error).message)),
  });

  return (
    <PageFrame title="Settings" subtitle="Demo workspace configuration. Preview signs the operator in automatically.">
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-border)]">
          <h2 className="text-sm font-semibold">Session</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Row k="Workspace" v={data?.workspace.name ?? "HelioDesk Support"} />
            <Row k="Product" v={data?.workspace.product ?? "HelioDesk Cloud"} />
            <Row k="Operator" v={data?.user.name ?? "Elena Voss"} />
            <Row k="Role" v={data?.user.role ?? "admin"} />
            <Row k="Email" v={data?.user.email ?? "elena.voss@heliodesk.example"} />
            <Row k="Embedding provider" v={data?.provider.embedding ?? "sandbox-hash-v1"} />
            <Row k="Generation provider" v={data?.provider.generation ?? "sandbox-extractive-v1"} />
          </dl>
          <p className="mt-3 text-xs text-ink-muted">{data?.workspace.notice}</p>
        </section>
        <section className="rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-border)]">
          <h2 className="text-sm font-semibold">Production credentials (fictional)</h2>
          <p className="mt-2 text-sm text-ink-muted">
            The FastAPI artifact authenticates operators. The browser preview never blocks on a login form.
          </p>
          <dl className="mt-3 space-y-2 text-sm">
            <Row k="Admin" v="admin@heliodesk.example / DemoAdmin!2026" />
            <Row k="Operator" v="operator@heliodesk.example / DemoOperator!2026" />
          </dl>
        </section>
        <section className="rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-border)]">
          <h2 className="text-sm font-semibold">Safety</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-muted">
            <li>No real .env file is shipped.</li>
            <li>No paid model is called from preview or tests.</li>
            <li>Send is simulated and labelled in the conversation.</li>
            <li>Indexed documents are untrusted reference data.</li>
          </ul>
        </section>
        <section className="rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-border)]">
          <h2 className="text-sm font-semibold">Reset demo data</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Restores the original fictional tickets, documents, and audit seed. This does not contact customers.
          </p>
          <Button className="mt-4" variant="secondary" onClick={() => reset.mutate()} disabled={reset.isPending}>
            Reset demo data
          </Button>
        </section>
      </div>
    </PageFrame>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-muted">{k}</dt>
      <dd className="text-right font-mono text-xs">{v}</dd>
    </div>
  );
}
