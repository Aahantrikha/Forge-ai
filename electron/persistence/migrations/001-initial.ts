export const INITIAL_MIGRATION = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  repo_remote TEXT,
  default_branch TEXT,
  last_opened_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  objective TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('planning','awaiting_approval','executing','blocked','integration_review','awaiting_merge_approval','completed','failed','cancelled')),
  plan_artifact_id TEXT REFERENCES artifacts(id),
  base_commit TEXT,
  base_branch TEXT,
  failure_reason TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  parent_task_id TEXT REFERENCES tasks(id),
  objective TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  task_type TEXT NOT NULL CHECK (task_type IN ('planning','research','coding','testing','review','integration')),
  status TEXT NOT NULL CHECK (status IN ('pending','ready','running','blocked','review','completed','failed','cancelled')),
  dependencies TEXT NOT NULL DEFAULT '[]',
  expected_output TEXT NOT NULL DEFAULT '',
  acceptance_criteria TEXT NOT NULL DEFAULT '[]',
  file_ownership TEXT NOT NULL DEFAULT '[]',
  assigned_agent_id TEXT REFERENCES agents(id),
  priority INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 1,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  execution_limits TEXT NOT NULL DEFAULT '{}',
  result_summary TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  system_instructions TEXT NOT NULL,
  model_config TEXT NOT NULL,
  model_session_id TEXT REFERENCES model_sessions(id),
  assigned_task_id TEXT REFERENCES tasks(id),
  available_tools TEXT NOT NULL DEFAULT '[]',
  filesystem_permissions TEXT NOT NULL DEFAULT '{}',
  working_directory TEXT NOT NULL,
  execution_limits TEXT NOT NULL DEFAULT '{}',
  tokens_used INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('idle','initializing','running','waiting','completed','failed','terminated')),
  heartbeat_at INTEGER,
  failure_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS agent_tasks (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  attempt INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('assigned','running','completed','failed','released')),
  assigned_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  UNIQUE (agent_id, task_id, attempt)
);

CREATE TABLE IF NOT EXISTS agent_messages (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  receiver_id TEXT,
  type TEXT NOT NULL CHECK (type IN ('question','answer','handoff','blocker','status','artifact','clarification')),
  task_id TEXT REFERENCES tasks(id),
  content TEXT NOT NULL,
  correlation_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  task_id TEXT REFERENCES tasks(id),
  agent_id TEXT REFERENCES agents(id),
  kind TEXT NOT NULL CHECK (kind IN ('plan','diff','patch','test_output','review_report','log','summary')),
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  checksum TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  supersedes TEXT REFERENCES artifacts(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  task_id TEXT REFERENCES tasks(id),
  agent_id TEXT REFERENCES agents(id),
  action_type TEXT NOT NULL CHECK (action_type IN ('plan','dependency_install','config_change','file_delete','external_access','db_migration','git_merge','remote_push')),
  requested_action TEXT NOT NULL,
  reason TEXT NOT NULL,
  affected_files TEXT NOT NULL DEFAULT '[]',
  proposed_command TEXT,
  impact TEXT NOT NULL,
  action_payload_hash TEXT NOT NULL,
  proposed_patch_ref TEXT REFERENCES artifacts(id),
  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','modification_requested','expired','cancelled')),
  requested_by TEXT NOT NULL,
  decided_by TEXT,
  decision_note TEXT,
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  decided_at INTEGER
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  workflow_id TEXT REFERENCES workflows(id) ON DELETE CASCADE,
  agent_id TEXT REFERENCES agents(id),
  task_id TEXT REFERENCES tasks(id),
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  correlation_id TEXT,
  causation_id TEXT,
  sequence INTEGER NOT NULL,
  delivery_count INTEGER NOT NULL DEFAULT 0,
  occurred_at INTEGER NOT NULL,
  persisted_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS model_sessions (
  id TEXT PRIMARY KEY,
  workflow_id TEXT REFERENCES workflows(id) ON DELETE SET NULL,
  agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  provider_session_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('active','closed','error')),
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  cost_estimate REAL,
  created_at INTEGER NOT NULL,
  closed_at INTEGER
);

CREATE TABLE IF NOT EXISTS execution_records (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  task_id TEXT REFERENCES tasks(id),
  agent_id TEXT REFERENCES agents(id),
  kind TEXT NOT NULL CHECK (kind IN ('command','test','tool','git')),
  command TEXT NOT NULL,
  working_directory TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running','completed','failed','cancelled','timed_out')),
  exit_code INTEGER,
  output_ref TEXT REFERENCES artifacts(id),
  timeout_ms INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER
);

CREATE TABLE IF NOT EXISTS workflow_checkpoints (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  state_snapshot TEXT NOT NULL DEFAULT '{}',
  base_commit TEXT,
  restored_at INTEGER,
  restore_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workflows_project ON workflows(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status);
CREATE INDEX IF NOT EXISTS idx_tasks_workflow_status ON tasks(workflow_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_agents_workflow_status ON agents(workflow_id, status);
CREATE INDEX IF NOT EXISTS idx_agents_task ON agents(assigned_task_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_task ON agent_tasks(task_id, status);
CREATE INDEX IF NOT EXISTS idx_messages_workflow ON agent_messages(workflow_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON agent_messages(receiver_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_task ON agent_messages(task_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_workflow_kind ON artifacts(workflow_id, kind);
CREATE INDEX IF NOT EXISTS idx_approvals_workflow_status ON approvals(workflow_id, status);
CREATE INDEX IF NOT EXISTS idx_approvals_status_expiry ON approvals(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_events_workflow_sequence ON events(workflow_id, sequence);
CREATE INDEX IF NOT EXISTS idx_events_type_time ON events(event_type, occurred_at);
CREATE INDEX IF NOT EXISTS idx_events_correlation ON events(correlation_id);
CREATE INDEX IF NOT EXISTS idx_sessions_agent ON model_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_executions_workflow ON execution_records(workflow_id, started_at);
CREATE INDEX IF NOT EXISTS idx_executions_task ON execution_records(task_id);
CREATE INDEX IF NOT EXISTS idx_checkpoints_workflow ON workflow_checkpoints(workflow_id, created_at);
`

export const MIGRATIONS = [{ version: 1, name: 'initial', sql: INITIAL_MIGRATION }] as const
