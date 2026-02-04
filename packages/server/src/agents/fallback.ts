/**
 * Auto-Retry with Fallback Models
 *
 * On task failure, retry once with an upgraded model.
 * If still fails, mark failed and let discovery handle.
 */

// =============================================================================
// Types
// =============================================================================

export interface RetryHistoryEntry {
  agent: string
  model: string
  error: string
  duration_seconds: number | null
  completed_at: string
}

export interface RetryContext {
  max_retries: number
  attempt: number
  original_agent: string
  original_model: string
  history: RetryHistoryEntry[]
}

export interface RetryDecision {
  retry: boolean
  fallbackModel: string | null
}

// =============================================================================
// Fallback Model Map
// =============================================================================

/**
 * Each agent escalates to a more capable model on failure.
 * null = no fallback (already top tier).
 */
const FALLBACK_MODEL_MAP: Record<string, Record<string, string | null>> = {
  claude: {
    haiku: 'sonnet',
    sonnet: 'opus',
    opus: null,
  },
  codex: {
    'gpt-5.2-codex-fast': 'gpt-5.2-codex',
    'gpt-5.2-codex': 'gpt-5.2-codex-high',
    'gpt-5.2-codex-high': null,
  },
  gemini: {
    flash: 'gemini-3-flash-preview',
    'gemini-3-flash-preview': 'gemini-3-pro-preview',
    'gemini-3-pro-preview': null,
  },
  cline: {
    // Escalation chain: cheaper -> more capable
    'glm-4.7-flash': 'glm-4.7',
    'glm-4.7': 'deepseek/deepseek-v3.2',
    'deepseek/deepseek-v3.2': 'qwen/qwen3-coder',
    'qwen/qwen3-coder': 'moonshotai/kimi-k2.5',
    'moonshotai/kimi-k2.5': null,
  },
  cursor: {
    'gemini-3-flash': 'composer-1',
    'gpt-5.2-codex': 'composer-1',
    'sonnet-4.5': 'composer-1',
    'composer-1': 'opus-4.5-thinking',
    'opus-4.5-thinking': null,
  },
}

/**
 * Default models per agent - used when task has no explicit model.
 */
const AGENT_DEFAULT_MODELS: Record<string, string> = {
  claude: 'sonnet',
  codex: 'gpt-5.2-codex',
  gemini: 'flash',
  cline: 'moonshotai/kimi-k2.5',
  cursor: 'composer-1',
}

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Pure lookup: get the fallback model for an agent/model combo.
 * Returns null if no fallback exists (already top tier or unknown model).
 */
export function getFallbackModel(agent: string, model: string | null | undefined): string | null {
  const resolvedModel = model ?? AGENT_DEFAULT_MODELS[agent]
  if (!resolvedModel) return null

  const agentMap = FALLBACK_MODEL_MAP[agent]
  if (!agentMap) return null

  const fallback = agentMap[resolvedModel]
  return fallback ?? null
}

/**
 * Determine whether a failed task should be retried.
 * Returns the decision and the fallback model to use.
 */
export function shouldRetry(
  agent: string,
  model: string | null | undefined,
  retryContextStr: string | null | undefined,
): RetryDecision {
  const existing = parseRetryContext(retryContextStr)

  // Already retried max times
  if (existing && existing.attempt >= existing.max_retries) {
    return { retry: false, fallbackModel: null }
  }

  const resolvedModel = model ?? AGENT_DEFAULT_MODELS[agent] ?? null
  const fallbackModel = getFallbackModel(agent, resolvedModel)

  if (!fallbackModel) {
    return { retry: false, fallbackModel: null }
  }

  return { retry: true, fallbackModel }
}

/**
 * Build the retry_context JSON string for storage.
 * Appends the current failure to history.
 */
export function buildRetryContext(
  agent: string,
  model: string | null | undefined,
  error: string,
  durationSeconds: number | null,
  existingStr: string | null | undefined,
): string {
  const existing = parseRetryContext(existingStr)
  const resolvedModel = model ?? AGENT_DEFAULT_MODELS[agent] ?? 'unknown'

  const entry: RetryHistoryEntry = {
    agent,
    model: resolvedModel,
    error: error.slice(0, 500),
    duration_seconds: durationSeconds,
    completed_at: new Date().toISOString(),
  }

  if (existing) {
    existing.attempt += 1
    existing.history.push(entry)
    return JSON.stringify(existing)
  }

  const ctx: RetryContext = {
    max_retries: 1,
    attempt: 1,
    original_agent: agent,
    original_model: resolvedModel,
    history: [entry],
  }

  return JSON.stringify(ctx)
}

/**
 * Parse retry_context from database string.
 * Returns null if empty or invalid.
 */
export function parseRetryContext(str: string | null | undefined): RetryContext | null {
  if (!str) return null

  try {
    const parsed = JSON.parse(str)
    if (parsed && typeof parsed.attempt === 'number' && Array.isArray(parsed.history)) {
      return parsed as RetryContext
    }
    return null
  } catch {
    return null
  }
}

/**
 * Get the resolved model name for a task (handles null/undefined).
 */
export function resolveModel(agent: string, model: string | null | undefined): string {
  return model ?? AGENT_DEFAULT_MODELS[agent] ?? 'unknown'
}
