import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { dashboardFn } from "@/lib/pilot/api";
import { categoryLabel } from "@/components/status-utils";
import { formatRelative } from "@/lib/utils";

export const Route = createFileRoute("/_app/dashboard")({
  loader: () => dashboardFn(),
  component: DashboardPage,
});

function DashboardPage() {
  const initial = Route.useLoaderData();
  const { data = initial, isLoading, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => dashboardFn(),
    initialData: initial,
  });

  if (isLoading || !data) {
    return <PageFrame title="Overview">{error ? <p className="text-danger">{String(error)}</p> : <p className="text-ink-muted">Loading workspace metrics…</p>}</PageFrame>;
  }

  const cards = [
    { label: "Open tickets", value: data.openTickets, hint: "Not resolved" },
    { label: "Needs review", value: data.needsReview, hint: "Unread or escalated" },
    { label: "Escalated", value: data.escalated, hint: "In specialist queues" },
    { label: "First-response SLA", value: pct(data.firstResponseSla), hint: "Met vs all tickets" },
    { label: "Resolution rate", value: pct(data.resolutionRate), hint: "Closed share" },
    { label: "Avg. confidence", value: data.averageConfidence.toFixed(2), hint: "From generated drafts" },
  ];

  return (
    <PageFrame
      title="Overview"
      subtitle="HelioDesk Support — operational snapshot from the seeded demo dataset."
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {cards.map((c) => (
          <div key={c.label} className="rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-border)]">
            <div className="text-xs font-medium text-ink-muted">{c.label}</div>
            <div className="mt-2 font-mono text-2xl tabular-nums tracking-tight text-ink">{c.value}</div>
            <div className="mt-1 text-[11px] text-ink-subtle">{c.hint}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <section className="xl:col-span-2 rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-border)]">
          <h2 className="text-sm font-semibold">Ticket volume — last 14 days</h2>
          <div className="mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.volumeByDay}>
                <CartesianGrid stroke="#E2E7EE" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(d) => String(d).slice(5)} tick={{ fontSize: 11, fill: "#5B6573" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#5B6573" }} />
                <Tooltip />
                <Bar dataKey="count" fill="#0F766E" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-border)]">
          <h2 className="text-sm font-semibold">Tickets by category</h2>
          <ul className="mt-3 space-y-2">
            {data.byCategory
              .slice()
              .sort((a, b) => b.count - a.count)
              .map((c) => (
                <li key={c.category} className="flex items-center justify-between text-sm">
                  <span className="capitalize text-ink-muted">{categoryLabel(c.category)}</span>
                  <span className="font-mono tabular-nums">{c.count}</span>
                </li>
              ))}
          </ul>
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-border)]">
          <h2 className="text-sm font-semibold">Recent escalations</h2>
          <ul className="mt-3 space-y-3">
            {data.recentEscalations.length === 0 ? (
              <li className="text-sm text-ink-muted">No escalations recorded yet. Generate a low-confidence draft to create one.</li>
            ) : (
              data.recentEscalations.map((e) => (
                <li key={e.ticketPublicId + e.createdAt}>
                  <Link to="/inbox/$ticketId" params={{ ticketId: e.ticketPublicId }} className="text-sm font-medium text-teal-ink hover:underline">
                    {e.ticketPublicId}
                  </Link>
                  <p className="text-xs text-ink-muted">{e.subject}</p>
                  <p className="mt-1 text-xs text-ink-subtle">{e.reason}</p>
                </li>
              ))
            )}
          </ul>
        </section>
        <section className="rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-border)]">
          <h2 className="text-sm font-semibold">Knowledge gaps</h2>
          <ul className="mt-3 space-y-2">
            {data.knowledgeGaps.map((g) => (
              <li key={g.gap} className="text-sm">
                <span className="font-mono tabular-nums text-ink-muted">{g.count}×</span>{" "}
                <span>{g.gap}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-border)]">
          <h2 className="text-sm font-semibold">Recent operator activity</h2>
          <ul className="mt-3 space-y-2">
            {data.recentActivity.map((a) => (
              <li key={a.id} className="text-xs">
                <span className="font-medium">{a.actorName}</span>{" "}
                <span className="text-ink-muted">{a.action}</span>
                <div className="text-ink-subtle" suppressHydrationWarning>
                  {formatRelative(a.createdAt)}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PageFrame>
  );
}

export function PageFrame({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
            {subtitle ? <p className="mt-1 text-sm text-ink-muted">{subtitle}</p> : null}
          </div>
          {actions}
        </div>
        {children}
      </div>
    </div>
  );
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}
