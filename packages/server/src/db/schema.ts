import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

// Tasks table
export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  status: text('status').notNull().default('pending'),
  agent: text('agent'),
  model: text('model'),
  repo_path: text('repo_path').notNull(),
  prompt: text('prompt'),

  // Dependencies (JSON array of task IDs)
  depends_on: text('depends_on').default('[]'),
  sequenced: integer('sequenced', { mode: 'boolean' }).default(false),

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
