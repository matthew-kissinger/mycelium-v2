/**
 * Test data factories for mycelium-v2 server tests.
 *
 * Each fixture returns a plain object with sensible defaults.
 * Pass overrides to customize specific fields.
 */

import type { SchedulerConfig } from '@mycelium/shared'

// =============================================================================
// Task Fixture
// =============================================================================

export interface TaskFixture {
  id: string
  title: string
  status: string
  agent: string | null
  model: string | null
  provider: string | null
  repo_path: string
  prompt: string | null
  depends_on: string
  sequenced: boolean
  branch_name: string | null
  github_url: string | null
  spec_context: string | null
  retry_context: string | null
  user_input: string | null
  enrich_with_opus: boolean
  timeout_seconds: number | null
  result: string | null
  parsed_result: string | null
  error: string | null
  error_details: string | null
  cost_usd: number
  duration_seconds: number | null
  input_tokens: number | null
  output_tokens: number | null
  created_at: string
  started_at: string | null
  completed_at: string | null
  worktree_path: string | null
  skills: string
  shepherd_evaluated_at: string | null
  armory_reviewed_at: string | null
}

let taskCounter = 0

export function taskFixture(overrides: Partial<TaskFixture> = {}): TaskFixture {
  taskCounter++
  const id = overrides.id ?? `00000000-0000-0000-0000-${String(taskCounter).padStart(12, '0')}`

  return {
    id,
    title: `Test task ${taskCounter}`,
    status: 'pending',
    agent: 'claude',
    model: 'sonnet',
    provider: null,
    repo_path: '/home/test/repo',
    prompt: 'Do the thing',
    depends_on: '[]',
    sequenced: true,
    branch_name: null,
    github_url: null,
    spec_context: null,
    retry_context: null,
    user_input: null,
    enrich_with_opus: false,
    timeout_seconds: null,
    result: null,
    parsed_result: null,
    error: null,
    error_details: null,
    cost_usd: 0,
    duration_seconds: null,
    input_tokens: null,
    output_tokens: null,
    created_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
    worktree_path: null,
    skills: '[]',
    shepherd_evaluated_at: null,
    armory_reviewed_at: null,
    ...overrides,
  }
}

// =============================================================================
// Repo Fixture
// =============================================================================

export interface RepoFixture {
  id: string
  path: string
  name: string
  description: string | null
  language: string | null
  mode: string
  weight: number
  skills: string
  is_public: number | null
  created_at: string
  last_scanned_at: string | null
}

let repoCounter = 0

export function repoFixture(overrides: Partial<RepoFixture> = {}): RepoFixture {
  repoCounter++
  const id = overrides.id ?? `repo-${String(repoCounter).padStart(8, '0')}`

  return {
    id,
    path: `/home/test/repo-${repoCounter}`,
    name: `test-repo-${repoCounter}`,
    description: 'A test repository',
    language: 'typescript',
    mode: 'align',
    weight: 50,
    skills: '[]',
    is_public: null,
    created_at: new Date().toISOString(),
    last_scanned_at: null,
    ...overrides,
  }
}

// =============================================================================
// Scheduler Config Fixture
// =============================================================================

export function configFixture(overrides: Partial<SchedulerConfig> = {}): SchedulerConfig {
  return {
    dispatcher_enabled: true,
    dispatcher_interval_sec: 60,
    max_concurrent_tasks: 3,
    min_concurrent_tasks: 3,
    max_concurrent_ceiling: 10,
    blocked_task_timeout_sec: 10800,
    blocked_check_enabled: true,
    orphan_cancel_timeout_sec: 14400,
    discovery_enabled: true,
    discovery_interval_sec: 900,
    discovery_repos: [],
    discovery_auto_create: [],
    shepherd_enabled: true,
    shepherd_interval_sec: 900,
    shepherd_batch_size: 5,
    armory_enabled: true,
    armory_batch_size: 10,
    digest_enabled: true,
    digest_interval_sec: 14400,
    compaction_enabled: true,
    compaction_interval_sec: 14400,
    health_check_enabled: true,
    health_check_interval_sec: 60,
    github_sync_enabled: true,
    github_sync_interval_sec: 1800,
    auto_prune_enabled: true,
    auto_prune_threshold: 100,
    auto_prune_keep: 30,
    registry_refresh_enabled: true,
    registry_refresh_interval_sec: 21600,
    ...overrides,
  }
}

// =============================================================================
// Memory Fixtures
// =============================================================================

export interface PatternFixture {
  id: string
  content: string
  source: string
  task_id: string | null
  repo_path: string | null
  tags: string
  created_at: string
}

let patternCounter = 0

export function patternFixture(overrides: Partial<PatternFixture> = {}): PatternFixture {
  patternCounter++
  const id = overrides.id ?? `pattern-${String(patternCounter).padStart(8, '0')}`

  return {
    id,
    content: `Test pattern ${patternCounter}`,
    source: 'test',
    task_id: null,
    repo_path: null,
    tags: '[]',
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

export interface WarningFixture {
  id: string
  content: string
  severity: string
  task_id: string | null
  repo_path: string | null
  created_at: string
}

let warningCounter = 0

export function warningFixture(overrides: Partial<WarningFixture> = {}): WarningFixture {
  warningCounter++
  const id = overrides.id ?? `warning-${String(warningCounter).padStart(8, '0')}`

  return {
    id,
    content: `Test warning ${warningCounter}`,
    severity: 'medium',
    task_id: null,
    repo_path: null,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

// =============================================================================
// Shepherd Evaluation Fixture
// =============================================================================

export interface ShepherdEvalFixture {
  id: string
  repo_path: string
  evaluated_at: string
  tasks_evaluated: string
  health: string
  headline: string
  concerns: string | null
  wins: string | null
  recommendation: string | null
  global_patterns: string | null
  global_warnings: string | null
  branch_evaluations: string | null
  raw_response: string | null
}

let evalCounter = 0

export function shepherdEvalFixture(overrides: Partial<ShepherdEvalFixture> = {}): ShepherdEvalFixture {
  evalCounter++
  const id = overrides.id ?? `eval-${String(evalCounter).padStart(8, '0')}`

  return {
    id,
    repo_path: '/home/test/repo',
    evaluated_at: new Date().toISOString(),
    tasks_evaluated: '[]',
    health: 'healthy',
    headline: 'All good',
    concerns: null,
    wins: null,
    recommendation: null,
    global_patterns: null,
    global_warnings: null,
    branch_evaluations: null,
    raw_response: null,
    ...overrides,
  }
}

// =============================================================================
// System Agent Run Fixture
// =============================================================================

export interface RunFixture {
  id: string
  agent_type: string
  status: string
  repo_path: string | null
  context: string | null
  output: string | null
  error: string | null
  started_at: string
  completed_at: string | null
}

let runCounter = 0

export function runFixture(overrides: Partial<RunFixture> = {}): RunFixture {
  runCounter++
  const id = overrides.id ?? `run-${String(runCounter).padStart(8, '0')}`

  return {
    id,
    agent_type: 'shepherd',
    status: 'running',
    repo_path: '/home/test/repo',
    context: null,
    output: null,
    error: null,
    started_at: new Date().toISOString(),
    completed_at: null,
    ...overrides,
  }
}

// =============================================================================
// Reset counters (call in beforeEach if tests need predictable IDs)
// =============================================================================

export function resetFixtureCounters(): void {
  taskCounter = 0
  repoCounter = 0
  patternCounter = 0
  warningCounter = 0
  evalCounter = 0
  runCounter = 0
}
