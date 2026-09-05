create table if not exists workspaces (
  id text primary key,
  name text not null,
  slug text not null unique,
  product_name text not null,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now()
);

create table if not exists operators (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  name text not null,
  email text not null,
  role text not null,
  title text not null
);

create table if not exists customers (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  name text not null,
  email text not null,
  company text not null,
  plan text not null,
  region text not null,
  created_at timestamptz not null,
  account_id text not null,
  health text not null
);

create table if not exists tickets (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  public_id text not null,
  customer_id text not null references customers(id),
  subject text not null,
  category text not null,
  priority text not null,
  status text not null,
  assignee_id text references operators(id),
  channel text not null,
  tags text not null default '[]',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  first_response_at timestamptz,
  resolved_at timestamptz,
  sla_deadline_at timestamptz not null,
  unread integer not null default 1,
  showcase text
);

create unique index if not exists tickets_public_id_idx on tickets (workspace_id, public_id);
create index if not exists tickets_status_idx on tickets (workspace_id, status);
create index if not exists tickets_priority_idx on tickets (workspace_id, priority);

create table if not exists conversation_messages (
  id text primary key,
  ticket_id text not null references tickets(id) on delete cascade,
  author_type text not null,
  author_name text not null,
  body text not null,
  created_at timestamptz not null,
  channel text not null,
  is_internal integer not null default 0,
  simulated integer not null default 0
);

create table if not exists internal_notes (
  id text primary key,
  ticket_id text not null references tickets(id) on delete cascade,
  author_id text not null,
  author_name text not null,
  body text not null,
  created_at timestamptz not null
);

create table if not exists knowledge_documents (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  public_id text not null,
  title text not null,
  category text not null,
  version text not null,
  source_type text not null,
  status text not null,
  chunk_count integer not null default 0,
  last_indexed_at timestamptz,
  owner_id text not null,
  owner_name text not null,
  usage_count integer not null default 0,
  filename text not null,
  body text not null default '',
  failed_reason text,
  suspicious integer not null default 0
);

create unique index if not exists knowledge_documents_public_idx on knowledge_documents (workspace_id, public_id);

create table if not exists knowledge_chunks (
  id text primary key,
  document_id text not null references knowledge_documents(id) on delete cascade,
  workspace_id text not null,
  ordinal integer not null,
  section text not null,
  page integer,
  text text not null,
  embedding text not null,
  token_count integer not null,
  flagged integer not null default 0,
  flag_reason text
);

create index if not exists knowledge_chunks_doc_idx on knowledge_chunks (document_id);

create table if not exists document_events (
  id text primary key,
  document_id text not null references knowledge_documents(id) on delete cascade,
  stage text not null,
  detail text not null,
  created_at timestamptz not null
);

create table if not exists retrieval_runs (
  id text primary key,
  workspace_id text not null,
  ticket_id text,
  query text not null,
  created_at timestamptz not null
);

create table if not exists retrieved_citations (
  id text primary key,
  run_id text not null references retrieval_runs(id) on delete cascade,
  draft_id text,
  chunk_id text not null,
  document_id text not null,
  document_title text not null,
  section text not null,
  excerpt text not null,
  score double precision not null,
  marker integer not null,
  flagged integer not null default 0
);

create table if not exists reply_drafts (
  id text primary key,
  public_id text not null,
  ticket_id text not null references tickets(id) on delete cascade,
  state text not null,
  body text not null,
  original_body text not null,
  confidence double precision not null,
  classification_json text not null,
  knowledge_gaps_json text not null,
  escalate integer not null default 0,
  escalate_reason text,
  insufficient_evidence integer not null default 0,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  approved_by text,
  approved_at timestamptz,
  sent_at timestamptz
);

create table if not exists escalations (
  id text primary key,
  ticket_id text not null references tickets(id) on delete cascade,
  reason text not null,
  recommended_queue text not null,
  created_at timestamptz not null,
  created_by text not null
);

create table if not exists audit_events (
  id text primary key,
  workspace_id text not null,
  actor_id text not null,
  actor_name text not null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  metadata_json text not null default '{}',
  created_at timestamptz not null
);

create index if not exists audit_events_ws_idx on audit_events (workspace_id, created_at);

create table if not exists provider_configurations (
  id text primary key,
  workspace_id text not null,
  embedding_provider text not null,
  generation_provider text not null,
  confidence_escalate_below double precision not null default 0.55,
  updated_at timestamptz not null
);

create table if not exists safety_events (
  id text primary key,
  workspace_id text not null,
  ticket_id text,
  document_id text,
  event_type text not null,
  detail text not null,
  created_at timestamptz not null
);
