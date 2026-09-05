import { Badge } from "@/components/ui/badge";
import type { Priority, SlaState, TicketStatus } from "@/lib/pilot/types";

export function StatusBadge({ status }: { status: TicketStatus }) {
  const map: Record<TicketStatus, { label: string; tone: "neutral" | "teal" | "amber" | "red" | "green" | "blue" }> = {
    new: { label: "New", tone: "blue" },
    in_progress: { label: "In progress", tone: "teal" },
    waiting: { label: "Waiting", tone: "amber" },
    resolved: { label: "Resolved", tone: "green" },
    escalated: { label: "Escalated", tone: "red" },
  };
  const m = map[status];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const map: Record<Priority, { label: string; tone: "neutral" | "amber" | "red" | "blue" }> = {
    low: { label: "Low", tone: "neutral" },
    normal: { label: "Normal", tone: "blue" },
    high: { label: "High", tone: "amber" },
    urgent: { label: "Urgent", tone: "red" },
  };
  const m = map[priority];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function SlaBadge({ state }: { state: SlaState }) {
  const map: Record<SlaState, { label: string; tone: "green" | "amber" | "red" | "neutral" }> = {
    ok: { label: "SLA ok", tone: "green" },
    warning: { label: "SLA risk", tone: "amber" },
    breached: { label: "SLA breach", tone: "red" },
    met: { label: "SLA met", tone: "neutral" },
  };
  const m = map[state];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}
