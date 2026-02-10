import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

// Tasks table
export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  status: text('status').notNull().default('pending'),
  agent: text('agent'),
  model: text('model'),
  provider: text('provider'), // For agents with multiple auth (cline: openrouter/cline)
  repo_path: text('repo_path').notNull(),
  prompt: text('prompt'),

  // Dependencies (JSON array of task IDs)
  depends_on: text('depends_on').default('[]'),
  sequenced: integer('sequenced', { mode: 'boolean' }).default(true),

  // Git/GitHub
  branch_name: text('branch_name'),
  github_url: text('github_url'),
  github_pr_number: integer('github_pr_number'),
  github_pr_url: text('github_pr_url'),

  // Context
  spec_context: text('spec_context'), // Orchestrator metadata JSON
  retry_context: text('retry_context'), // Previous error context for retries
  user_input: text('user_input'), // Original user request
  enrich_with_opus: integer('enrich_with_opus', { mode: 'boolean' }).default(false),

  // Execution config
  timeout_seconds: integer('timeout_seconds'),

  // Results
  result: text('result'),
  parsed_result: text('parsed_result'), // JSON
  error: text('error'),
  error_details: text('error_details'), // JSON

  // Metrics
  cost_usd: real('cost_usd').default(0),
  duration_seconds: real('duration_seconds'),
  input_tokens: integer('input_tokens'),
  output_tokens: integer('output_tokens'),

  // Timestamps
  created_at: text('created_at').notNull(),
  started_at: text('started_at'),
  completed_at: text('completed_at'),

  // Workspace isolation
  worktree_path: text('worktree_path'),

  // Skills (JSON array of skill names)
  skills: text('skills').default('[]'),

  // Evaluation tracking
  shepherd_evaluated_at: text('shepherd_evaluated_at'),
  armory_reviewed_at: text('armory_reviewed_at'),
})

// Repos table
export const repos = sqliteTable('repos', {
  id: text('id').primaryKey(),
  path: text('path').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  language: text('language'),
  mode: text('mode').notNull().default('align'),
  weight: integer('weight').default(50), // 0-100 allocation weight for discovery selection
  // Skills (JSON array of detected skill names)
  skills: text('skills').default('[]'),

  // GitHub integration
  github_owner: text('github_owner'),
  github_repo: text('github_repo'),
  github_default_branch: text('github_default_branch'),
  is_public: integer('is_public'), // 0/1 boolean

  created_at: text('created_at').notNull(),
  last_scanned_at: text('last_scanned_at'),
})

// Signals table (alignment/human-in-the-loop)
export const signals = sqliteTable('signals', {
  id: text('id').primaryKey(),
  question: text('question').notNull(),
  options: text('options'), // JSON array
  status: text('status').notNull().default('pending'),
  response: text('response'),
  task_id: text('task_id'),
  repo_path: text('repo_path'),
  telegram_message_id: integer('telegram_message_id'), // Message ID in Telegram (for reply matching)
  created_at: text('created_at').notNull(),
  responded_at: text('responded_at'),
})

// Memory patterns
export const memory_patterns = sqliteTable('memory_patterns', {
  id: text('id').primaryKey(),
  content: text('content').notNull(),
  source: text('source').notNull(),
  task_id: text('task_id'),
  repo_path: text('repo_path'),
  tags: text('tags').default('[]'), // JSON array
  created_at: text('created_at').notNull(),
})

// Memory warnings
export const memory_warnings = sqliteTable('memory_warnings', {
  id: text('id').primaryKey(),
  content: text('content').notNull(),
  severity: text('severity').notNull().default('medium'),
  task_id: text('task_id'),
  repo_path: text('repo_path'),
  created_at: text('created_at').notNull(),
})

// System agent runs (discovery, shepherd, etc.)
export const system_agent_runs = sqliteTable('system_agent_runs', {
  id: text('id').primaryKey(),
  agent_type: text('agent_type').notNull(),
  status: text('status').notNull().default('running'),
  repo_path: text('repo_path'),
  context: text('context'), // JSON
  output: text('output'),
  error: text('error'),
  started_at: text('started_at').notNull(),
  completed_at: text('completed_at'),
})

// Shepherd evaluations
export const shepherd_evaluations = sqliteTable('shepherd_evaluations', {
  id: text('id').primaryKey(),
  repo_path: text('repo_path').notNull(),
  evaluated_at: text('evaluated_at').notNull(),
  tasks_evaluated: text('tasks_evaluated').notNull(), // JSON array of task IDs
  health: text('health').notNull(), // 'healthy' | 'warning' | 'critical'
  headline: text('headline').notNull(),
  concerns: text('concerns'), // JSON array of strings
  wins: text('wins'), // JSON array of strings
  recommendation: text('recommendation'),
  global_patterns: text('global_patterns'), // JSON array
  global_warnings: text('global_warnings'), // JSON array
  branch_evaluations: text('branch_evaluations'), // JSON array of {branch, action, reason}
  raw_response: text('raw_response'),
})

// Agent stats (performance tracking per agent)
export const agent_stats = sqliteTable('agent_stats', {
  agent_id: text('agent_id').primaryKey(),
  total_tasks: integer('total_tasks').default(0),
  successful: integer('successful').default(0),
  failed: integer('failed').default(0),
  success_rate: real('success_rate').default(0),
  total_cost: real('total_cost').default(0),
  best_for: text('best_for'), // JSON array
  avoid_for: text('avoid_for'), // JSON array
  updated_at: text('updated_at'),
})

// Fruiting sessions (task execution context trace)
export const fruiting_sessions = sqliteTable('fruiting_sessions', {
  id: text('id').primaryKey(),
  task_id: text('task_id').notNull(),
  repo_path: text('repo_path').notNull(),
  agent: text('agent'),
  model: text('model'),
  context_trace: text('context_trace'), // JSON
  full_prompt: text('full_prompt'),
  session_log: text('session_log'), // JSON array of {chunk, stream, timestamp} - TTL 24h
  created_at: text('created_at').notNull(),
})

// Config overrides (replaces JSON files on disk)
export const config_overrides = sqliteTable('config_overrides', {
  key: text('key').primaryKey(), // 'scheduler', 'agents', 'genesis', 'hooks'
  value: text('value').notNull(), // JSON blob
  updated_at: text('updated_at').notNull(),
  updated_by: text('updated_by').default('api'), // 'api', 'cli', 'import'
})

// Prompt overrides (replaces .md files on disk)
export const prompt_overrides = sqliteTable('prompt_overrides', {
  prompt_id: text('prompt_id').primaryKey(),
  content: text('content').notNull(),
  updated_at: text('updated_at').notNull(),
})

// Config change history (audit trail)
export const config_history = sqliteTable('config_history', {
  id: text('id').primaryKey(),
  config_key: text('config_key').notNull(), // 'scheduler', 'agents.claude', 'prompt:discovery'
  field: text('field'), // specific field changed, or null for full replace
  old_value: text('old_value'),
  new_value: text('new_value'),
  changed_at: text('changed_at').notNull(),
  changed_by: text('changed_by').default('api'),
})

// Devices table (network devices for control and monitoring)
export const devices = sqliteTable('devices', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  type: text('type').notNull(), // roku, yamaha, ssh, ollama, http, flipper
  host: text('host').notNull(),
  port: integer('port'),
  protocol: text('protocol').default('http'), // http, https, upnp, ssh, serial

  // Health tracking
  status: text('status').default('unknown'), // online, offline, degraded, unknown
  last_seen: text('last_seen'),
  last_error: text('last_error'),
  response_time_ms: integer('response_time_ms'),

  // Device-specific config (JSON)
  config: text('config'), // JSON object for device-specific settings

  // Metadata
  description: text('description'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at'),
})

// Scheduler cycle stats (persisted across restarts)
export const scheduler_stats = sqliteTable('scheduler_stats', {
  cycle_name: text('cycle_name').primaryKey(),
  runs_completed: integer('runs_completed').default(0),
  errors: integer('errors').default(0),
  last_run_at: text('last_run_at'),
  last_duration_ms: integer('last_duration_ms'),
  last_error: text('last_error'),
  updated_at: text('updated_at'),
})

// =============================================================================
// Dynamic Agent/Provider Registry
// =============================================================================

// Providers - API provider registry
export const providers = sqliteTable('providers', {
  id: text('id').primaryKey(), // e.g. 'anthropic', 'openrouter', 'groq'
  name: text('name').notNull(),
  api_base: text('api_base'), // e.g. 'https://api.anthropic.com'
  billing: text('billing').notNull().default('subscription'), // 'subscription' | 'per_use' | 'free'
  auth_type: text('auth_type'), // 'api_key' | 'oauth' | 'sso' | 'none'
  auth_key_env: text('auth_key_env'), // env var name e.g. 'ANTHROPIC_API_KEY'

  // Health/status
  status: text('status').default('unknown'), // 'available' | 'unavailable' | 'degraded' | 'unknown'
  last_checked_at: text('last_checked_at'),
  last_error: text('last_error'),
  rate_limit_info: text('rate_limit_info'), // JSON
  credits_info: text('credits_info'), // JSON

  // Model fetching
  models_fetched_at: text('models_fetched_at'),

  // Flexible config
  config: text('config'), // JSON

  created_at: text('created_at').notNull(),
  updated_at: text('updated_at'),
})

// Agents - CLI agent registry
export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(), // e.g. 'claude', 'codex'
  command: text('command').notNull(), // CLI command e.g. 'claude', 'agent' (for cursor)
  cli_version: text('cli_version'),
  timeout_seconds: integer('timeout_seconds').default(1800),
  max_turns: integer('max_turns'),
  supports_streaming: integer('supports_streaming', { mode: 'boolean' }).default(true),

  // Provider relationship
  default_provider: text('default_provider'), // FK to providers.id
  default_model: text('default_model'),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  status: text('status').default('unknown'), // 'available' | 'unavailable' | 'degraded' | 'unknown'

  // Capabilities
  has_headless: integer('has_headless', { mode: 'boolean' }).default(true),
  has_json_output: integer('has_json_output', { mode: 'boolean' }).default(false),
  has_model_list_cmd: integer('has_model_list_cmd', { mode: 'boolean' }).default(false),
  has_mcp: integer('has_mcp', { mode: 'boolean' }).default(false),
  has_acp: integer('has_acp', { mode: 'boolean' }).default(false),
  model_list_cmd: text('model_list_cmd'), // e.g. 'agent models', 'pi --list-models'

  // Detection
  cli_detected_at: text('cli_detected_at'),
  notes: text('notes'),

  // Flexible config (arg patterns, env vars, auth files)
  config: text('config'), // JSON

  created_at: text('created_at').notNull(),
  updated_at: text('updated_at'),
})

// Models - Model registry across all providers
export const models = sqliteTable('models', {
  id: text('id').primaryKey(), // composite like 'anthropic/opus' or 'openrouter/moonshotai/kimi-k2.5'
  provider_id: text('provider_id').notNull(), // FK to providers.id
  model_id: text('model_id').notNull(), // provider-native ID e.g. 'opus', 'moonshotai/kimi-k2.5'
  short_name: text('short_name'), // display alias e.g. 'kimi-k2.5'

  // Capabilities
  context_window: integer('context_window'), // in K tokens
  cost_input: real('cost_input'), // per 1K tokens
  cost_output: real('cost_output'), // per 1K tokens
  strengths: text('strengths'), // JSON array
  thinking: integer('thinking', { mode: 'boolean' }).default(false),
  vision: integer('vision', { mode: 'boolean' }).default(false),
  free: integer('free', { mode: 'boolean' }).default(false),

  // Agent compatibility
  compatible_agents: text('compatible_agents'), // JSON array of agent IDs

  // Fallback chain
  fallback_model_id: text('fallback_model_id'), // self FK for escalation chain

  // Status
  available: integer('available', { mode: 'boolean' }).default(true),
  last_used_at: text('last_used_at'),
  source: text('source').default('seed'), // 'seed' | 'api_fetch' | 'manual'

  created_at: text('created_at').notNull(),
  updated_at: text('updated_at'),
})

