import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageFrame } from "@/routes/_app/dashboard";
import { Button } from "@/components/ui/button";
import { analyticsFn } from "@/lib/pilot/api";
import { categoryLabel } from "@/components/status-utils";

export const Route = createFileRoute("/_app/analytics")({
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const [range, setRange] = useState<7 | 30 | 90>(30);
  const { data, isLoading } = useQuery({
    queryKey: ["analytics", range],
    queryFn: () => analyticsFn({ data: { rangeDays: range } }),
  });

  return (
    <PageFrame
      title="Analytics"
      subtitle="Operational rates computed from the seeded ticket set. Ranges are 7, 30, and 90 days."
      actions={
        <div className="flex gap-1">
          {([7, 30, 90] as const).map((d) => (
            <Button key={d} size="sm" variant={range === d ? "navy" : "secondary"} onClick={() => setRange(d)}>
              {d}d
            </Button>
          ))}
        </div>
      }
    >
      {!data || isLoading ? (
        <p className="text-ink-muted">Loading analytics…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="Resolution rate" value={pct(data.resolutionRate)} />
            <Stat label="First-response hours" value={String(data.firstResponseHours)} />
            <Stat label="Escalation rate" value={pct(data.escalationRate)} />
            <Stat label="Draft acceptance" value={pct(data.draftAcceptanceRate)} />
            <Stat label="Avg. confidence" value={data.averageConfidence.toFixed(2)} />
            <Stat label="Human edit distance" value={data.editDistance.toFixed(2)} />
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            <section className="rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-border)]">
              <h2 className="text-sm font-semibold">Ticket volume</h2>
              <div className="mt-3 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.ticketVolume}>
                    <CartesianGrid stroke="var(--color-line)" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={(d) => String(d).slice(5)} tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="count" stroke="var(--color-teal)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
            <section className="rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-border)]">
              <h2 className="text-sm font-semibold">SLA risk distribution</h2>
              <div className="mt-3 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.slaRisk}>
                    <CartesianGrid stroke="var(--color-line)" vertical={false} />
                    <XAxis dataKey="state" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="var(--color-navy)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <section className="rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-border)]">
              <h2 className="text-sm font-semibold">Most common categories</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {data.categories
                  .slice()
                  .sort((a, b) => b.count - a.count)
                  .map((c) => (
                    <li key={c.category} className="flex justify-between">
                      <span className="capitalize">{categoryLabel(c.category)}</span>
                      <span className="font-mono tabular-nums">{c.count}</span>
                    </li>
                  ))}
              </ul>
            </section>
            <section className="rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-border)]">
              <h2 className="text-sm font-semibold">Most-used documents</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {data.documents.map((d) => (
                  <li key={d.title} className="flex justify-between gap-3">
                    <span>{d.title}</span>
                    <span className="font-mono tabular-nums">{d.usage}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-border)]">
              <h2 className="text-sm font-semibold">Knowledge-gap frequency</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {data.knowledgeGaps.length === 0 ? <li className="text-ink-muted">No gaps recorded in this range.</li> : null}
                {data.knowledgeGaps.map((g) => (
                  <li key={g.gap}>
                    <span className="font-mono tabular-nums">{g.count}×</span> {g.gap}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}
    </PageFrame>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-border)]">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className="mt-1 font-mono text-xl tabular-nums">{value}</div>
    </div>
  );
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}
