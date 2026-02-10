/**
 * Auto-Retry with Fallback Models
 *
 * On task failure, retry once with an upgraded model.
 * If still fails, mark failed and let discovery handle.
 */

import { getCachedFallbackModel, getCachedCrossAgentFallback, getCachedDefaultModel } from './registry-cache'

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
  fallbackAgent?: string  // Set when falling back to a different agent
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
    'gpt-5.2-codex-high': 'gpt-5.3-codex',
    'gpt-5.3-codex': null,
  },
  gemini: {
    flash: 'gemini-3-flash-preview',
    'gemini-3-flash-preview': 'gemini-3-pro-preview',
    'gemini-3-pro-preview': null,
    'gemini-2.5-flash': 'gemini-3-flash-preview',
    'gemini-2.5-pro': null,
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
    'composer-1': 'opus-4.6-thinking',
    'opus-4.6-thinking': null,
    'opus-4.5-thinking': null,  // Legacy
  },
}

/**
 * Cross-agent fallback: when an agent exhausts its model chain, try a different agent.
 * Maps agent -> { agent, model } for the fallback target.
 */
const CROSS_AGENT_FALLBACK: Record<string, { agent: string; model: string }> = {
  claude: { agent: 'codex', model: 'gpt-5.2-codex' },       // Subscription -> subscription
  codex: { agent: 'cursor', model: 'composer-1' },           // Subscription -> subscription
  cursor: { agent: 'claude', model: 'sonnet' },              // Subscription -> subscription
  gemini: { agent: 'pi', model: 'google/gemini-2.5-flash' }, // Free -> free via OpenRouter
  cline: { agent: 'pi', model: 'qwen/qwen3-coder' },        // Per-use -> per-use via OpenRouter
  kiro: { agent: 'claude', model: 'sonnet' },                // Subscription -> subscription
  copilot: { agent: 'claude', model: 'sonnet' },             // Subscription -> subscription
  pi: { agent: 'opencode', model: 'opencode/kimi-k2.5-free' }, // Free alternative
  opencode: { agent: 'gemini', model: 'flash' },             // Free alternative
  vibe: { agent: 'cline', model: 'mistralai/devstral-2512' }, // Same Mistral backend via OpenRouter
}

/**
 * Default models per agent - used when task has no explicit model.
 */
const AGENT_DEFAULT_MODELS: Record<string, string> = {
  claude: 'sonnet',
  codex: 'gpt-5.2-codex',
  gemini: 'flash',
  cline: 'moonshotai/kimi-k2.5',
  cursor: 'opus-4.6-thinking',
  kiro: 'default',
  vibe: 'default',
  pi: 'moonshotai/kimi-k2.5',
  opencode: 'opencode/kimi-k2.5-free',
  copilot: 'claude-opus-4.6',
}

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Pure lookup: get the fallback model for an agent/model combo.
 * Returns null if no fallback exists (already top tier or unknown model).
 *
 * Tries registry cache first (DB-backed), falls back to hardcoded map.
 */
export function getFallbackModel(agent: string, model: string | null | undefined): string | null {
  const resolvedModel = model ?? AGENT_DEFAULT_MODELS[agent]
  if (!resolvedModel) return null

  // Registry cache (DB-backed fallback chain) - primary source
  const cachedFallback = getCachedFallbackModel(agent, resolvedModel)
  if (cachedFallback) return cachedFallback

  // Hardcoded fallback (seed data) - covers models not yet in DB
  const agentMap = FALLBACK_MODEL_MAP[agent]
  if (!agentMap) return null

  const fallback = agentMap[resolvedModel]
  return fallback ?? null
}

/**
 * Determine whether a failed task should be retried.
 * First tries in-agent model escalation, then cross-agent fallback.
 * Returns the decision, fallback model, and optionally a different agent.
 */
export function shouldRetry(
  agent: string,
  model: string | null | undefined,
  retryContextStr: string | null | undefined,
): RetryDecision {
  const existing = parseRetryContext(retryContextStr)

  // Allow up to 2 retries to support cross-agent fallback after in-agent exhaustion
  const maxRetries = 2
  if (existing && existing.attempt >= maxRetries) {
    return { retry: false, fallbackModel: null }
  }

  const resolvedModel = model ?? AGENT_DEFAULT_MODELS[agent] ?? null
  const fallbackModel = getFallbackModel(agent, resolvedModel)

  if (fallbackModel) {
    return { retry: true, fallbackModel }
  }

  // In-agent fallback exhausted - try cross-agent fallback
  let crossFallback = getCachedCrossAgentFallback(agent)
  if (!crossFallback) {
    crossFallback = CROSS_AGENT_FALLBACK[agent] ?? null
  }
  if (crossFallback) {
    // Don't cross-agent fallback if we already did (check history)
    if (existing?.history.some(h => h.agent === crossFallback.agent)) {
      return { retry: false, fallbackModel: null }
    }
    return { retry: true, fallbackModel: crossFallback.model, fallbackAgent: crossFallback.agent }
  }

  return { retry: false, fallbackModel: null }
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
    max_retries: 2,
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
 * Tries registry cache first, then hardcoded defaults.
 */
export function resolveModel(agent: string, model: string | null | undefined): string {
  if (model) return model

  // Registry cache is the source of truth for default models
  const cached = getCachedDefaultModel(agent)
  if (cached) return cached

  return AGENT_DEFAULT_MODELS[agent] ?? 'unknown'
}
