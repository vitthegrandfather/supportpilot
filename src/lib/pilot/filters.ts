import type { Category, Priority, TicketListItem, TicketStatus } from "./types";

export interface TicketFilters {
  q?: string;
  status?: TicketStatus | "all" | string;
  priority?: Priority | "all" | string;
  category?: Category | "all" | string;
  assignee?: string | "all" | "unassigned";
  needsReview?: boolean;
  sort?: "newest" | "oldest" | "priority" | "sla";
}

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

export function applyTicketFilters(items: TicketListItem[], filters: TicketFilters = {}): TicketListItem[] {
  let next = items;
  if (filters.q) {
    const q = filters.q.toLowerCase();
    next = next.filter(
      (t) =>
        t.subject.toLowerCase().includes(q) ||
        t.customerName.toLowerCase().includes(q) ||
        t.publicId.toLowerCase().includes(q) ||
        t.snippet.toLowerCase().includes(q),
    );
  }
  if (filters.status && filters.status !== "all") next = next.filter((t) => t.status === filters.status);
  if (filters.priority && filters.priority !== "all") next = next.filter((t) => t.priority === filters.priority);
  if (filters.category && filters.category !== "all") next = next.filter((t) => t.category === filters.category);
  if (filters.assignee === "unassigned") next = next.filter((t) => !t.assigneeId);
  else if (filters.assignee && filters.assignee !== "all") {
    next = next.filter((t) => t.assigneeId === filters.assignee);
  }
  if (filters.needsReview) {
    next = next.filter(
      (t) =>
        t.tags.includes("needs-review") ||
        t.status === "escalated" ||
        t.showcase === "low_confidence" ||
        t.showcase === "security" ||
        t.unread,
    );
  }
  const sort = filters.sort ?? "newest";
  return next.slice().sort((a, b) => {
    if (sort === "oldest") return +new Date(a.createdAt) - +new Date(b.createdAt);
    if (sort === "priority") return (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
    if (sort === "sla") return +new Date(a.slaDeadlineAt) - +new Date(b.slaDeadlineAt);
    return +new Date(b.createdAt) - +new Date(a.createdAt);
  });
}
