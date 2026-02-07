import { z } from 'zod'

// Default intervals in seconds
export const DEFAULT_DISPATCHER_INTERVAL = 60 // 1 minute
export const DEFAULT_DISCOVERY_INTERVAL = 900 // 15 minutes
export const DEFAULT_DIGEST_INTERVAL = 14400 // 4 hours (smart Haiku agent)
export const DEFAULT_COMPACTION_INTERVAL = 14400 // 4 hours (smart Haiku agent)
export const DEFAULT_HEALTH_CHECK_INTERVAL = 60 // 1 minute

// Scheduler configuration
export const SchedulerConfig = z.object({
  // Dispatcher cycle
  dispatcher_enabled: z.boolean().default(true),
  dispatcher_interval_sec: z.number().int().positive().default(DEFAULT_DISPATCHER_INTERVAL),
  max_concurrent_tasks: z.number().int().positive().default(3),
  min_concurrent_tasks: z.number().int().positive().default(3),
  max_concurrent_ceiling: z.number().int().positive().default(10),

  // Blocked task detection
  blocked_task_timeout_sec: z.number().int().positive().default(10800), // 3 hours
  blocked_check_enabled: z.boolean().default(true),
  orphan_cancel_timeout_sec: z.number().int().positive().default(14400), // 4 hours

  // Discovery cycle
  discovery_enabled: z.boolean().default(true),
  discovery_interval_sec: z.number().int().positive().default(DEFAULT_DISCOVERY_INTERVAL),
  discovery_repos: z.array(z.string()).default([]),
  discovery_auto_create: z.array(z.string()).default([]),

  // Shepherd cycle (interval-based, checks for repos with batch_size+ unevaluated tasks)
  shepherd_enabled: z.boolean().default(true),
  shepherd_interval_sec: z.number().int().positive().default(900), // 15 minutes
  shepherd_batch_size: z.number().int().positive().default(5), // Tasks needed before evaluation

  // Armory cycle (triggered after N completed tasks network-wide)
  armory_enabled: z.boolean().default(true),
  armory_batch_size: z.number().int().positive().default(10), // Tasks needed before armory review

  // Digest cycle
  digest_enabled: z.boolean().default(true),
  digest_interval_sec: z.number().int().positive().default(DEFAULT_DIGEST_INTERVAL),

  // Compaction cycle (smart Haiku agent)
  compaction_enabled: z.boolean().default(true),
  compaction_interval_sec: z.number().int().positive().default(DEFAULT_COMPACTION_INTERVAL),

  // Health check cycle (device monitoring)
  health_check_enabled: z.boolean().default(true),
  health_check_interval_sec: z.number().int().positive().default(60),

  // GitHub sync cycle (repo metadata caching)
  github_sync_enabled: z.boolean().default(true),
  github_sync_interval_sec: z.number().int().positive().default(1800), // 30 minutes

  // Auto-prune
  auto_prune_enabled: z.boolean().default(true),
  auto_prune_threshold: z.number().int().positive().default(100),
  auto_prune_keep: z.number().int().positive().default(30),
})
export type SchedulerConfig = z.infer<typeof SchedulerConfig>

// Cycle state
export const CycleState = z.object({
  name: z.string(),
  enabled: z.boolean(),
  running: z.boolean(),
  last_run: z.string().datetime().optional(),
  next_run: z.string().datetime().optional(),
  runs_completed: z.number().int().nonnegative().default(0),
  errors: z.number().int().nonnegative().default(0),
})
export type CycleState = z.infer<typeof CycleState>

// Active system agent run info
export const ActiveRunInfo = z.object({
  run_id: z.string(),
  agent_type: z.string(),
  repo_path: z.string().optional(),
  started_at: z.string(),
})
export type ActiveRunInfo = z.infer<typeof ActiveRunInfo>

// Scheduler status (all cycle states)
export const SchedulerStatus = z.object({
  running: z.boolean(),
  started_at: z.string().datetime().optional(),
  active_runs: z.array(ActiveRunInfo).optional(),
  cycles: z.array(CycleState),
})
export type SchedulerStatus = z.infer<typeof SchedulerStatus>
