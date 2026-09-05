import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { useMemo } from "react";
import { Input, Select } from "@/components/ui/input";
import { PriorityBadge, SlaBadge, StatusBadge } from "@/components/status";
import { categoryLabel } from "@/components/status-utils";
import { listOperatorsFn, listTicketsFn } from "@/lib/pilot/api";
import type { TicketListItem } from "@/lib/pilot/types";
import { cn, formatRelative } from "@/lib/utils";

type InboxSearch = {
  q?: string;
  status?: string;
  priority?: string;
  category?: string;
  assignee?: string;
  needsReview?: boolean;
  sort?: "newest" | "oldest" | "priority" | "sla";
};

export const Route = createFileRoute("/_app/inbox")({
  validateSearch: (s: Record<string, unknown>): InboxSearch => ({
    q: typeof s.q === "string" ? s.q : undefined,
    status: typeof s.status === "string" ? s.status : undefined,
    priority: typeof s.priority === "string" ? s.priority : undefined,
    category: typeof s.category === "string" ? s.category : undefined,
    assignee: typeof s.assignee === "string" ? s.assignee : undefined,
    needsReview: s.needsReview === true || s.needsReview === "true",
    sort: s.sort === "oldest" || s.sort === "priority" || s.sort === "sla" ? s.sort : "newest",
  }),
  component: InboxLayout,
});

function InboxLayout() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const params = useParams({ strict: false }) as { ticketId?: string };
  const selected = params.ticketId;

  const { data: tickets = [] } = useQuery({
    queryKey: ["tickets", search],
    queryFn: () =>
      listTicketsFn({
        data: {
          q: search.q,
          status: search.status,
          priority: search.priority,
          category: search.category,
          assignee: search.assignee,
          needsReview: search.needsReview,
          sort: search.sort,
        },
      }),
  });
  const { data: operators = [] } = useQuery({
    queryKey: ["operators"],
    queryFn: () => listOperatorsFn(),
  });

  const set = (patch: Partial<InboxSearch>) => {
    void navigate({
      search: (prev) => ({ ...prev, ...patch }),
    });
  };

  const showList = !selected;

  return (
    <div className="flex h-full min-h-0">
      <section
        className={cn(
          "flex w-full shrink-0 flex-col border-r border-line bg-surface md:w-[340px]",
          selected ? "hidden md:flex" : "flex",
        )}
      >
        <div className="border-b border-line p-3">
          <div className="flex items-center justify-between">
            <h1 className="text-sm font-semibold">Inbox</h1>
            <span className="font-mono text-xs tabular-nums text-ink-muted">{tickets.length}</span>
          </div>
          <Input
            className="mt-2"
            placeholder="Search name, subject, ID"
            value={search.q ?? ""}
            onChange={(e) => set({ q: e.target.value || undefined })}
          />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Select value={search.status ?? "all"} onChange={(e) => set({ status: e.target.value === "all" ? undefined : e.target.value })}>
              <option value="all">All statuses</option>
              <option value="new">New</option>
              <option value="in_progress">In progress</option>
              <option value="waiting">Waiting</option>
              <option value="resolved">Resolved</option>
              <option value="escalated">Escalated</option>
            </Select>
            <Select value={search.priority ?? "all"} onChange={(e) => set({ priority: e.target.value === "all" ? undefined : e.target.value })}>
              <option value="all">All priorities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </Select>
            <Select value={search.category ?? "all"} onChange={(e) => set({ category: e.target.value === "all" ? undefined : e.target.value })}>
              <option value="all">All categories</option>
              <option value="billing">Billing</option>
              <option value="account_access">Account access</option>
              <option value="integrations">Integrations</option>
              <option value="privacy">Privacy</option>
              <option value="security">Security</option>
              <option value="outage">Outage</option>
              <option value="product">Product</option>
              <option value="cancellation">Cancellation</option>
              <option value="other">Other</option>
            </Select>
            <Select value={search.assignee ?? "all"} onChange={(e) => set({ assignee: e.target.value === "all" ? undefined : e.target.value })}>
              <option value="all">All assignees</option>
              <option value="unassigned">Unassigned</option>
              {operators.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs text-ink-muted">
              <input
                type="checkbox"
                checked={Boolean(search.needsReview)}
                onChange={(e) => set({ needsReview: e.target.checked || undefined })}
              />
              Needs review
            </label>
            <Select value={search.sort ?? "newest"} onChange={(e) => set({ sort: e.target.value as InboxSearch["sort"] })}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="priority">Priority</option>
              <option value="sla">SLA risk</option>
            </Select>
          </div>
        </div>
        <ul className="min-h-0 flex-1 overflow-auto">
          {tickets.map((t) => (
            <TicketRow key={t.id} ticket={t} active={selected === t.id || selected === t.publicId} />
          ))}
          {tickets.length === 0 ? (
            <li className="p-4 text-sm text-ink-muted">No tickets match these filters.</li>
          ) : null}
        </ul>
      </section>
      <div className={cn("min-w-0 flex-1", !selected && "hidden md:block")}>{showList && !selected ? <EmptyTicket /> : <Outlet />}</div>
    </div>
  );
}

function TicketRow({ ticket, active }: { ticket: TicketListItem; active: boolean }) {
  return (
    <li>
      <Link
        to="/inbox/$ticketId"
        params={{ ticketId: ticket.id }}
        className={cn(
          "block border-b border-line px-3 py-2.5 hover:bg-paper",
          active && "bg-teal-soft/60",
        )}
      >
        <div className="flex items-start gap-2">
          <span
            className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", ticket.unread ? "bg-teal" : "bg-transparent")}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium">{ticket.customerName}</span>
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-subtle" suppressHydrationWarning>
                {formatRelative(ticket.lastActivityAt)}
              </span>
            </div>
            <div className="truncate text-xs text-ink">{ticket.subject}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <span className="font-mono text-[10px] text-ink-subtle">{ticket.publicId}</span>
              <StatusBadge status={ticket.status} />
              <PriorityBadge priority={ticket.priority} />
              <SlaBadge state={ticket.slaState} />
              <span className="text-[10px] capitalize text-ink-subtle">{categoryLabel(ticket.category)}</span>
            </div>
          </div>
        </div>
      </Link>
    </li>
  );
}

function EmptyTicket() {
  const { data: tickets = [] } = useQuery({
    queryKey: ["tickets", { sort: "newest" }],
    queryFn: () => listTicketsFn({ data: { sort: "newest" } }),
  });
  const featured = useMemo(
    () => tickets.find((t) => t.showcase === "grounded_billing") ?? tickets[0],
    [tickets],
  );
  return (
    <div className="flex h-full flex-col items-start justify-center px-10">
      <h2 className="text-lg font-semibold">Select a ticket</h2>
      <p className="mt-2 max-w-md text-sm text-ink-muted">
        Open a conversation from the list. The duplicate annual-plan charge is the grounded billing walkthrough.
      </p>
      {featured ? (
        <Link
          to="/inbox/$ticketId"
          params={{ ticketId: featured.id }}
          className="mt-4 text-sm font-medium text-teal-ink hover:underline"
        >
          Open {featured.publicId}
        </Link>
      ) : null}
    </div>
  );
}
