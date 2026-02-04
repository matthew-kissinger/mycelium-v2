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
  sequenced: integer('sequenced', { mode: 'boolean' }).default(false),

  // Git/GitHub
  branch_name: text('branch_name'),
  github_url: text('github_url'),

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

  // Timestamps
  created_at: text('created_at').notNull(),
  started_at: text('started_at'),
  completed_at: text('completed_at'),

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
