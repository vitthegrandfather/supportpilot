import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { applyTicketFilters } from "./filters.ts";
import type { TicketListItem } from "./types.ts";

function t(partial: Partial<TicketListItem> & Pick<TicketListItem, "id" | "subject" | "status" | "priority">): TicketListItem {
  return {
    workspaceId: "ws",
    publicId: partial.publicId ?? partial.id.toUpperCase(),
    customerId: "c",
    category: "billing",
    assigneeId: null,
    channel: "email",
    tags: [],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    firstResponseAt: null,
    resolvedAt: null,
    slaDeadlineAt: "2026-09-02T00:00:00.000Z",
    unread: false,
    customerName: "Jordan Hale",
    customerCompany: "Northpark",
    assigneeName: null,
    slaState: "ok",
    lastActivityAt: "2026-09-01T00:00:00.000Z",
    snippet: "charged twice",
    ...partial,
  };
}

describe("ticket filtering", () => {
  const items = [
    t({ id: "a", subject: "Duplicate annual charge", status: "new", priority: "high", unread: true, tags: ["needs-review"], publicId: "TKT-2026-00101" }),
    t({
      id: "b",
      subject: "Feature request",
      status: "resolved",
      priority: "low",
      category: "product",
      customerName: "Hannah Cho",
      createdAt: "2026-08-01T00:00:00.000Z",
    }),
    t({ id: "c", subject: "Outage", status: "escalated", priority: "urgent", category: "outage", slaDeadlineAt: "2026-09-01T01:00:00.000Z" }),
  ];

  it("filters by status and search", () => {
    const r = applyTicketFilters(items, { status: "new", q: "duplicate" });
    assert.equal(r.length, 1);
    assert.equal(r[0].id, "a");
  });

  it("needs-review includes unread and escalated", () => {
    const r = applyTicketFilters(items, { needsReview: true });
    assert.ok(r.some((x) => x.id === "a"));
    assert.ok(r.some((x) => x.id === "c"));
    assert.ok(!r.some((x) => x.id === "b"));
  });

  it("sorts by priority", () => {
    const r = applyTicketFilters(items, { sort: "priority" });
    assert.equal(r[0].priority, "urgent");
  });
});
