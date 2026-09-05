import { getSql } from "@/lib/db";
import { ensureSeeded } from "../store";
import { DEMO_WORKSPACE_ID, type AnalyticsPayload, type Category, type DashboardMetrics, type SlaState } from "../types";
import { iso, parseJson, slaState } from "./tickets";

export async function dashboardMetrics(): Promise<DashboardMetrics> {
  await ensureSeeded();
  const sql = await getSql();
  const tickets = await sql.query<Record<string, unknown>>(
    `select * from tickets where workspace_id = $1`,
    [DEMO_WORKSPACE_ID],
  );
  const open = tickets.filter((t) => !["resolved"].includes(String(t.status)));
  const needsReview = tickets.filter(
    (t) => String(t.status) === "escalated" || String(t.showcase) === "security" || Number(t.unread) === 1,
  );
  const escalated = tickets.filter((t) => String(t.status) === "escalated");
  const slaHits = tickets.filter((t) => {
    if (!t.first_response_at) return String(t.status) === "resolved";
    return new Date(iso(t.first_response_at)).getTime() <= new Date(iso(t.sla_deadline_at)).getTime();
  });
  const resolved = tickets.filter((t) => String(t.status) === "resolved");

  const drafts = await sql.query<{ confidence: number }>(
    `select d.confidence from reply_drafts d join tickets t on t.id = d.ticket_id where t.workspace_id = $1`,
    [DEMO_WORKSPACE_ID],
  );
  const avgConf = drafts.length
    ? drafts.reduce((s, d) => s + Number(d.confidence), 0) / drafts.length
    : 0.78;

  const volumeByDay: { date: string; count: number }[] = [];
  for (let i = 13; i >= 0; i -= 1) {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - i);
    const key = day.toISOString().slice(0, 10);
    const count = tickets.filter((t) => iso(t.created_at).slice(0, 10) === key).length;
    volumeByDay.push({ date: key, count });
  }

  const catMap = new Map<Category, number>();
  for (const t of tickets) {
    const c = t.category as Category;
    catMap.set(c, (catMap.get(c) ?? 0) + 1);
  }

  const esc = await sql.query<Record<string, unknown>>(
    `select e.*, t.public_id, t.subject from escalations e
     join tickets t on t.id = e.ticket_id
     where t.workspace_id = $1
     order by e.created_at desc limit 5`,
    [DEMO_WORKSPACE_ID],
  );

  const activity = await sql.query<Record<string, unknown>>(
    `select * from audit_events where workspace_id = $1 order by created_at desc limit 8`,
    [DEMO_WORKSPACE_ID],
  );

  const gaps = await sql.query<{ knowledge_gaps_json: string }>(
    `select knowledge_gaps_json from reply_drafts`,
  );
  const gapCount = new Map<string, number>();
  for (const g of gaps) {
    for (const item of parseJson(g.knowledge_gaps_json, [] as string[])) {
      gapCount.set(item, (gapCount.get(item) ?? 0) + 1);
    }
  }
  if (gapCount.size === 0) {
    gapCount.set("No public-sector or government tenant policy is indexed.", 1);
    gapCount.set("No white-glove onboarding policy is indexed.", 1);
  }

  return {
    openTickets: open.length,
    needsReview: needsReview.length,
    escalated: escalated.length,
    firstResponseSla: tickets.length ? slaHits.length / tickets.length : 0,
    resolutionRate: tickets.length ? resolved.length / tickets.length : 0,
    averageConfidence: Math.round(avgConf * 100) / 100,
    volumeByDay,
    byCategory: [...catMap.entries()].map(([category, count]) => ({ category, count })),
    recentEscalations: esc.map((e) => ({
      ticketPublicId: String(e.public_id),
      subject: String(e.subject),
      reason: String(e.reason),
      createdAt: iso(e.created_at),
    })),
    knowledgeGaps: [...gapCount.entries()].map(([gap, count]) => ({ gap, count })),
    recentActivity: activity.map((r) => ({
      id: String(r.id),
      workspaceId: String(r.workspace_id),
      actorId: String(r.actor_id),
      actorName: String(r.actor_name),
      action: String(r.action),
      entityType: String(r.entity_type),
      entityId: String(r.entity_id),
      metadata: parseJson(r.metadata_json, {} as Record<string, string | number | boolean | null>),
      createdAt: iso(r.created_at),
    })),
  };
}

export async function analytics(rangeDays: 7 | 30 | 90): Promise<AnalyticsPayload> {
  await ensureSeeded();
  const sql = await getSql();
  const since = new Date(Date.now() - rangeDays * 86400_000).toISOString();
  const tickets = await sql.query<Record<string, unknown>>(
    `select * from tickets where workspace_id = $1 and created_at >= $2`,
    [DEMO_WORKSPACE_ID, since],
  );
  const allTickets = tickets.length
    ? tickets
    : await sql.query<Record<string, unknown>>(`select * from tickets where workspace_id = $1`, [
        DEMO_WORKSPACE_ID,
      ]);

  const volume: { date: string; count: number }[] = [];
  for (let i = rangeDays - 1; i >= 0; i -= 1) {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - i);
    const key = day.toISOString().slice(0, 10);
    volume.push({
      date: key,
      count: allTickets.filter((t) => iso(t.created_at).slice(0, 10) === key).length,
    });
  }

  const resolved = allTickets.filter((t) => String(t.status) === "resolved");
  const escalated = allTickets.filter((t) => String(t.status) === "escalated");
  const drafts = await sql.query<Record<string, unknown>>(
    `select d.* from reply_drafts d join tickets t on t.id = d.ticket_id where t.workspace_id = $1`,
    [DEMO_WORKSPACE_ID],
  );
  const approved = drafts.filter((d) => ["approved", "simulated_sent"].includes(String(d.state)));
  const conf = drafts.length
    ? drafts.reduce((s, d) => s + Number(d.confidence), 0) / drafts.length
    : 0.74;

  const frHours = allTickets
    .filter((t) => t.first_response_at)
    .map((t) => (new Date(iso(t.first_response_at)).getTime() - new Date(iso(t.created_at)).getTime()) / 3600_000);
  const avgFr = frHours.length ? frHours.reduce((a, b) => a + b, 0) / frHours.length : 3.4;

  const catMap = new Map<string, number>();
  for (const t of allTickets) catMap.set(String(t.category), (catMap.get(String(t.category)) ?? 0) + 1);

  const docs = await sql.query<{ title: string; usage_count: number }>(
    `select title, usage_count from knowledge_documents where workspace_id = $1 order by usage_count desc limit 8`,
    [DEMO_WORKSPACE_ID],
  );

  const gapCount = new Map<string, number>();
  for (const d of drafts) {
    for (const g of parseJson(d.knowledge_gaps_json, [] as string[])) {
      gapCount.set(g, (gapCount.get(g) ?? 0) + 1);
    }
  }

  let edit = 0;
  let editN = 0;
  for (const d of drafts) {
    if (String(d.body) !== String(d.original_body)) {
      edit += levenshteinRatio(String(d.original_body), String(d.body));
      editN += 1;
    }
  }

  const slaMap: Record<SlaState, number> = { ok: 0, warning: 0, breached: 0, met: 0 };
  for (const t of allTickets) {
    const s = slaState(iso(t.sla_deadline_at), t.status as "new" | "in_progress" | "waiting" | "resolved" | "escalated");
    slaMap[s] += 1;
  }

  return {
    rangeDays,
    ticketVolume: volume,
    resolutionRate: allTickets.length ? resolved.length / allTickets.length : 0,
    firstResponseHours: Math.round(avgFr * 10) / 10,
    escalationRate: allTickets.length ? escalated.length / allTickets.length : 0,
    draftAcceptanceRate: drafts.length ? approved.length / drafts.length : 0,
    averageConfidence: Math.round(conf * 100) / 100,
    categories: [...catMap.entries()].map(([category, count]) => ({ category, count })),
    documents: docs.map((d) => ({ title: d.title, usage: Number(d.usage_count) })),
    knowledgeGaps: [...gapCount.entries()].map(([gap, count]) => ({ gap, count })),
    editDistance: editN ? Math.round((edit / editN) * 100) / 100 : 0.12,
    slaRisk: (Object.entries(slaMap) as [SlaState, number][]).map(([state, count]) => ({ state, count })),
  };
}

function levenshteinRatio(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m || !n) return 1;
  const dp = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i += 1) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n] / Math.max(m, n);
}
