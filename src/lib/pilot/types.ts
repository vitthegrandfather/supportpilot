export const TICKET_STATUSES = [
  "new",
  "in_progress",
  "waiting",
  "resolved",
  "escalated",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const CATEGORIES = [
  "billing",
  "account_access",
  "integrations",
  "privacy",
  "security",
  "outage",
  "product",
  "cancellation",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CHANNELS = ["email", "chat", "portal"] as const;
export type Channel = (typeof CHANNELS)[number];

export const SENTIMENTS = ["negative", "neutral", "positive", "frustrated"] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

export const DOC_STATUSES = [
  "pending",
  "extracting",
  "chunking",
  "embedding",
  "ready",
  "failed",
  "archived",
] as const;
export type DocumentStatus = (typeof DOC_STATUSES)[number];

export const SOURCE_TYPES = ["pdf", "docx", "txt", "markdown", "html", "manual"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const DRAFT_STATES = [
  "generated",
  "edited",
  "approved",
  "simulated_sent",
  "blocked",
] as const;
export type DraftState = (typeof DRAFT_STATES)[number];

export const ROLES = ["admin", "operator"] as const;
export type Role = (typeof ROLES)[number];

export type SlaState = "ok" | "warning" | "breached" | "met";

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  productName: string;
  timezone: string;
}

export interface Operator {
  id: string;
  workspaceId: string;
  name: string;
  email: string;
  role: Role;
  title: string;
}

export interface Customer {
  id: string;
  workspaceId: string;
  name: string;
  email: string;
  company: string;
  plan: string;
  region: string;
  createdAt: string;
  accountId: string;
  health: "good" | "watch" | "risk";
}

export interface Ticket {
  id: string;
  workspaceId: string;
  publicId: string;
  customerId: string;
  subject: string;
  category: Category;
  priority: Priority;
  status: TicketStatus;
  assigneeId: string | null;
  channel: Channel;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  slaDeadlineAt: string;
  unread: boolean;
  showcase?: "grounded_billing" | "low_confidence" | "security" | "prompt_injection";
}

export interface ConversationMessage {
  id: string;
  ticketId: string;
  authorType: "customer" | "operator" | "system";
  authorName: string;
  body: string;
  createdAt: string;
  channel: Channel;
  isInternal: boolean;
  simulated?: boolean;
}

export interface InternalNote {
  id: string;
  ticketId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface KnowledgeDocument {
  id: string;
  workspaceId: string;
  publicId: string;
  title: string;
  category: Category | "policy" | "runbook";
  version: string;
  sourceType: SourceType;
  status: DocumentStatus;
  chunkCount: number;
  lastIndexedAt: string | null;
  ownerId: string;
  ownerName: string;
  usageCount: number;
  filename: string;
  body: string;
  failedReason: string | null;
  suspicious?: boolean;
}

export interface KnowledgeChunk {
  id: string;
  documentId: string;
  workspaceId: string;
  ordinal: number;
  section: string;
  page: number | null;
  text: string;
  embedding: number[];
  tokenCount: number;
  flagged: boolean;
  flagReason: string | null;
}

export interface ClassificationResult {
  category: Category;
  sentiment: Sentiment;
  urgency: "low" | "medium" | "high";
  suggestedPriority: Priority;
  reasoning: string;
  safetyFlags: string[];
}

export interface RetrievedCitation {
  id: string;
  chunkId: string;
  documentId: string;
  documentTitle: string;
  section: string;
  excerpt: string;
  score: number;
  marker: number;
  flagged: boolean;
}

export interface ReplyDraft {
  id: string;
  publicId: string;
  ticketId: string;
  state: DraftState;
  body: string;
  originalBody: string;
  confidence: number;
  classification: ClassificationResult;
  citations: RetrievedCitation[];
  knowledgeGaps: string[];
  escalate: boolean;
  escalateReason: string | null;
  insufficientEvidence: boolean;
  createdAt: string;
  updatedAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  sentAt: string | null;
}

export interface EscalationRecord {
  id: string;
  ticketId: string;
  reason: string;
  recommendedQueue: string;
  createdAt: string;
  createdBy: string;
}

export type JsonScalar = string | number | boolean | null;

export interface AuditEvent {
  id: string;
  workspaceId: string;
  actorId: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, JsonScalar>;
  createdAt: string;
}

export interface PipelineStage {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "blocked";
}

export interface RetrievalHit {
  chunk: KnowledgeChunk;
  documentTitle: string;
  score: number;
  lexical: number;
  cosine: number;
}

export interface DashboardMetrics {
  openTickets: number;
  needsReview: number;
  escalated: number;
  firstResponseSla: number;
  resolutionRate: number;
  averageConfidence: number;
  volumeByDay: { date: string; count: number }[];
  byCategory: { category: Category; count: number }[];
  recentEscalations: {
    ticketPublicId: string;
    subject: string;
    reason: string;
    createdAt: string;
  }[];
  knowledgeGaps: { gap: string; count: number }[];
  recentActivity: AuditEvent[];
}

export interface AnalyticsPayload {
  rangeDays: number;
  ticketVolume: { date: string; count: number }[];
  resolutionRate: number;
  firstResponseHours: number;
  escalationRate: number;
  draftAcceptanceRate: number;
  averageConfidence: number;
  categories: { category: string; count: number }[];
  documents: { title: string; usage: number }[];
  knowledgeGaps: { gap: string; count: number }[];
  editDistance: number;
  slaRisk: { state: SlaState; count: number }[];
}

export interface TicketListItem extends Ticket {
  customerName: string;
  customerCompany: string;
  assigneeName: string | null;
  slaState: SlaState;
  lastActivityAt: string;
  snippet: string;
}

export const DEMO_WORKSPACE_ID = "ws_heliodesk_demo";
export const DEMO_OPERATOR_ID = "usr_elena_voss";
