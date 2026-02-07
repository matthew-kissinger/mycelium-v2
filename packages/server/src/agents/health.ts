/**
 * Agent Health and Quota Tracking
 *
 * Tracks usage, quota status, and error patterns for each agent.
 * Provides intelligent error extraction from agent output.
 */

import { broadcast } from '../sse'

// Per-agent health state
interface AgentHealth {
  agent: string
  model?: string
  status: 'healthy' | 'degraded' | 'quota_exceeded' | 'error'
  quotaResetAt?: Date
  lastError?: string
  lastErrorAt?: Date
  errorCount: number
  successCount: number
  lastSuccessAt?: Date
}

// Health state by agent (and optionally model)
const healthState = new Map<string, AgentHealth>()

/**
 * Get health key for an agent/model combination.
 */
function healthKey(agent: string, model?: string): string {
  return model ? `${agent}/${model}` : agent
}

/**
 * Get or create health state for an agent.
 */
function getHealth(agent: string, model?: string): AgentHealth {
  const key = healthKey(agent, model)
  if (!healthState.has(key)) {
    healthState.set(key, {
      agent,
      model,
      status: 'healthy',
      errorCount: 0,
      successCount: 0,
    })
  }
  return healthState.get(key)!
}

/**
 * Extract meaningful error message from agent output.
 * Agents dump a lot of output - we want to find the actual error.
 */
export function extractError(agent: string, output: string): {
  error: string
  errorType?: 'quota' | 'timeout' | 'api_error' | 'crash' | 'unknown'
  quotaResetMs?: number
} {
  // Gemini quota error
  const geminiQuotaMatch = output.match(/Your quota will reset after (\d+)h(\d+)m(\d+)s/)
  if (geminiQuotaMatch) {
    const hours = parseInt(geminiQuotaMatch[1])
    const mins = parseInt(geminiQuotaMatch[2])
    const secs = parseInt(geminiQuotaMatch[3])
    const resetMs = (hours * 3600 + mins * 60 + secs) * 1000
    return {
      error: `Quota exceeded - resets in ${hours}h ${mins}m`,
      errorType: 'quota',
      quotaResetMs: resetMs,
    }
  }

  // Gemini 429 error
  if (output.includes('TerminalQuotaError') || output.includes('code: 429')) {
    return {
      error: 'Gemini quota exceeded',
      errorType: 'quota',
    }
  }

  // Timeout - only match the explicit [TIMEOUT] marker from dispatch.ts
  // Do NOT match the word 'timeout' generically (it appears in --timeout flags, prompt context, etc.)
  if (output.includes('[TIMEOUT]')) {
    return {
      error: 'Task timed out',
      errorType: 'timeout',
    }
  }

  // Claude API error
  const claudeApiMatch = output.match(/API Error: (\d+) ({.+})/)
  if (claudeApiMatch) {
    try {
      const errData = JSON.parse(claudeApiMatch[2])
      return {
        error: `API Error ${claudeApiMatch[1]}: ${errData.error?.message || 'Unknown'}`,
        errorType: 'api_error',
      }
    } catch {
      return {
        error: `API Error ${claudeApiMatch[1]}`,
        errorType: 'api_error',
      }
    }
  }

  // Cline process cleanup (crash)
  if (output.includes('Cleaning up core process') && output.includes('Cleaning up host process')) {
    return {
      error: 'Cline process crashed during startup',
      errorType: 'crash',
    }
  }

  // Cline conversation error
  if (output.includes('Conversation') && output.includes('error')) {
    const match = output.match(/Conversation[^.]*error[^.]*\./)
    return {
      error: match ? match[0] : 'Cline conversation error',
      errorType: 'api_error',
    }
  }

  // Zombie/Orphan detection
  if (output.includes('Zombie process') || output.includes('Orphaned')) {
    return {
      error: output.match(/Zombie.*|Orphaned.*/)?.[0] || 'Process died unexpectedly',
      errorType: 'crash',
    }
  }

  // Codex usage limit (429) - parse resets_at for quota backoff
  if (output.includes('usage_limit_reached') || (agent === 'codex' && output.includes('429'))) {
    const resetsMatch = output.match(/resets_at['":\s]+(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)/)
    let quotaResetMs: number | undefined
    if (resetsMatch) {
      const resetTime = new Date(resetsMatch[1]).getTime()
      if (!isNaN(resetTime)) {
        quotaResetMs = Math.max(0, resetTime - Date.now())
      }
    }
    return {
      error: 'Codex usage limit reached (429)',
      errorType: 'quota',
      quotaResetMs,
    }
  }

  // Codex model not supported
  if (agent === 'codex' && output.includes('model is not supported')) {
    const modelMatch = output.match(/model['":\s]+([^\s'"]+)['":\s]+is not supported/)
    return {
      error: modelMatch ? `Codex model "${modelMatch[1]}" not supported` : 'Codex model not supported',
      errorType: 'api_error',
    }
  }

  // OpenRouter rate limit
  if (output.includes('rate limit') || output.includes('429')) {
    return {
      error: 'Rate limited by provider',
      errorType: 'quota',
    }
  }

  // Groq rate limit (free tier)
  if (output.includes('Rate limit reached') || (agent === 'groq' && output.includes('429'))) {
    const waitMatch = output.match(/try again in (\d+\.?\d*)s/)
    const waitMs = waitMatch ? parseFloat(waitMatch[1]) * 1000 : 60000
    return {
      error: 'Groq rate limit reached',
      errorType: 'quota',
      quotaResetMs: waitMs,
    }
  }

  // Copilot auth error
  if (output.includes('GH_TOKEN') || output.includes('authentication') && agent === 'copilot') {
    return {
      error: 'Copilot authentication failed - check GH_TOKEN',
      errorType: 'api_error',
    }
  }

  // Pi/OpenRouter API error
  if (output.includes('OPENROUTER_API_KEY') || output.includes('API key')) {
    return {
      error: 'Missing or invalid API key',
      errorType: 'api_error',
    }
  }

  // Vibe/Mistral error
  if (output.includes('MISTRAL_API_KEY') || (agent === 'vibe' && output.includes('Unauthorized'))) {
    return {
      error: 'Mistral API authentication failed',
      errorType: 'api_error',
    }
  }

  // Kiro tool approval error (missing --trust-all-tools)
  if (output.includes('Tool approval required') && output.includes('--trust-all-tools')) {
    return {
      error: 'Kiro requires --trust-all-tools flag for non-interactive mode',
      errorType: 'api_error',
    }
  }

  // Kiro AWS auth error
  if (output.includes('SSO session') || output.includes('IAM Identity') || (agent === 'kiro' && output.includes('expired'))) {
    return {
      error: 'Kiro AWS SSO session expired - run kiro-cli login',
      errorType: 'api_error',
    }
  }

  // OpenCode free model errors
  if (agent === 'opencode' && output.includes('model not found')) {
    return {
      error: 'OpenCode model not available',
      errorType: 'api_error',
    }
  }

  // Cerebras rate limit (free tier)
  if (output.includes('cerebras') && output.includes('429') ||
      (agent === 'pi' && output.includes('Too Many Requests') && output.includes('cerebras'))) {
    return {
      error: 'Cerebras rate limit reached',
      errorType: 'quota',
      quotaResetMs: 60000, // Default 1 min backoff; bucket refills continuously
    }
  }

  // Generic error extraction - find first line that looks like an error
  const lines = output.split('\n')
  for (const line of lines) {
    const lower = line.toLowerCase()
    if (
      (lower.includes('error') || lower.includes('failed') || lower.includes('exception')) &&
      !lower.includes('yolo mode') &&  // Skip Gemini boot message
      !lower.includes('hook registry') &&
      line.length > 10 && line.length < 500
    ) {
      return {
        error: line.trim().slice(0, 200),
        errorType: 'unknown',
      }
    }
  }

  // If output is short, just use it
  if (output.length < 300) {
    return {
      error: output.trim(),
      errorType: 'unknown',
    }
  }

  // Last resort - use last 200 chars
  return {
    error: output.slice(-200).trim(),
    errorType: 'unknown',
  }
}

/**
 * Record a successful task execution.
 */
export function recordSuccess(agent: string, model?: string): void {
  const health = getHealth(agent, model)
  health.successCount++
  health.lastSuccessAt = new Date()

  // Reset to healthy if we were degraded
  if (health.status === 'degraded') {
    health.status = 'healthy'
  }

  // Clear quota exceeded if we succeeded
  if (health.status === 'quota_exceeded') {
    health.status = 'healthy'
    health.quotaResetAt = undefined
  }
}

/**
 * Record a failed task execution.
 */
export function recordFailure(
  agent: string,
  model: string | undefined,
  output: string
): { error: string; shouldBackoff: boolean; backoffMs?: number } {
  const health = getHealth(agent, model)
  health.errorCount++
  health.lastErrorAt = new Date()

  const extracted = extractError(agent, output)
  health.lastError = extracted.error

  // Handle quota exceeded specially
  if (extracted.errorType === 'quota') {
    health.status = 'quota_exceeded'
    if (extracted.quotaResetMs) {
      health.quotaResetAt = new Date(Date.now() + extracted.quotaResetMs)
    }

    broadcast('agent:quota_exceeded', {
      type: 'agent:quota_exceeded',
      agent,
      model,
      error: extracted.error,
      reset_at: health.quotaResetAt?.toISOString(),
      timestamp: new Date().toISOString(),
    })

    return {
      error: extracted.error,
      shouldBackoff: true,
      backoffMs: extracted.quotaResetMs,
    }
  }

  // Mark as degraded if multiple recent failures
  if (health.errorCount > 3 && health.status === 'healthy') {
    health.status = 'degraded'
  }

  return {
    error: extracted.error,
    shouldBackoff: false,
  }
}

/**
 * Check if an agent is available for dispatch.
 */
export function isAgentAvailable(agent: string, model?: string): {
  available: boolean
  reason?: string
  retryAfterMs?: number
} {
  const health = getHealth(agent, model)

  if (health.status === 'quota_exceeded' && health.quotaResetAt) {
    const now = Date.now()
    const resetAt = health.quotaResetAt.getTime()

    if (now < resetAt) {
      return {
        available: false,
        reason: `Quota exceeded - resets at ${health.quotaResetAt.toISOString()}`,
        retryAfterMs: resetAt - now,
      }
    }

    // Quota should have reset
    health.status = 'healthy'
    health.quotaResetAt = undefined

    broadcast('agent:quota_reset', {
      type: 'agent:quota_reset',
      agent,
      model,
      timestamp: new Date().toISOString(),
    })
  }

  return { available: true }
}

/**
 * Get all agent health states.
 */
export function getAllHealth(): AgentHealth[] {
  return Array.from(healthState.values())
}

/**
 * Get health summary for API response.
 */
export function getHealthSummary(): Record<string, {
  status: string
  errorCount: number
  successCount: number
  lastError?: string
  quotaResetAt?: string
}> {
  const result: Record<string, any> = {}

  for (const [key, health] of healthState.entries()) {
    result[key] = {
      status: health.status,
      errorCount: health.errorCount,
      successCount: health.successCount,
      lastError: health.lastError,
      quotaResetAt: health.quotaResetAt?.toISOString(),
    }
  }

  return result
}

/**
 * Check OpenRouter credits via API.
 * Returns null if unable to check.
 */
export async function checkOpenRouterCredits(): Promise<{
  limit: number
  remaining: number
  usage: number
  isFreeTier: boolean
  expiresAt?: string
} | null> {
  try {
    // Read API key from cline secrets
    const secretsPath = `${process.env.HOME}/.cline/data/secrets.json`
    const secrets = await Bun.file(secretsPath).json()
    const apiKey = secrets.openRouterApiKey

    if (!apiKey) return null

    const response = await fetch('https://openrouter.ai/api/v1/key', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    })

    if (!response.ok) return null

    const data = await response.json() as any

    return {
      limit: data.data.limit,
      remaining: data.data.limit_remaining,
      usage: data.data.usage,
      isFreeTier: data.data.is_free_tier,
      expiresAt: data.data.expires_at,
    }
  } catch {
    return null
  }
}

/**
 * Check Cline account credits via API.
 * Returns null if unable to check (token expired, not configured, etc.)
 */
export async function checkClineCredits(): Promise<{
  balance: number
  userId: string
  email: string
} | null> {
  try {
    const secretsPath = `${process.env.HOME}/.cline/data/secrets.json`
    const secrets = await Bun.file(secretsPath).json()
    const clineAccount = secrets['cline:clineAccountId']

    if (!clineAccount?.idToken) return null

    // Check if token is expired
    if (clineAccount.expiresAt && clineAccount.expiresAt < Date.now() / 1000) {
      console.log('[Health] Cline token expired, needs re-auth via CLI')
      return null
    }

    const response = await fetch('https://api.cline.bot/v1/user', {
      headers: { 'Authorization': `Bearer ${clineAccount.idToken}` },
    })

    if (!response.ok) {
      // Token might be invalid even if not expired
      return null
    }

    const data = await response.json() as any

    return {
      balance: data.balance ?? data.credits ?? 0,
      userId: clineAccount.userInfo?.id ?? '',
      email: clineAccount.userInfo?.email ?? '',
    }
  } catch {
    return null
  }
}

/**
 * Get current cline API provider from config.
 * Returns 'openrouter', 'cline', or the provider name.
 */
export async function getClineProvider(): Promise<string | null> {
  try {
    const proc = Bun.spawn(['cline', 'config', 'list', '-F', 'plain'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const output = await new Response(proc.stdout).text()
    await proc.exited

    // Parse "act-mode-api-provider: openrouter" from output
    const match = output.match(/act-mode-api-provider:\s*(\S+)/)
    return match?.[1] || null
  } catch {
    return null
  }
}

/**
 * Get free models available on OpenRouter.
 * Cached for 1 hour to avoid rate limits.
 */
let freeModelsCache: { models: string[]; fetchedAt: number } | null = null

export async function getOpenRouterFreeModels(): Promise<string[]> {
  // Return cached if fresh (1 hour)
  if (freeModelsCache && Date.now() - freeModelsCache.fetchedAt < 3600000) {
    return freeModelsCache.models
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/models')
    if (!response.ok) return freeModelsCache?.models ?? []

    const data = await response.json() as any
    const freeModels = data.data
      .filter((m: any) => m.pricing?.prompt === '0' || m.pricing?.prompt === 0)
      .map((m: any) => m.id)
      .sort()

    freeModelsCache = { models: freeModels, fetchedAt: Date.now() }
    return freeModels
  } catch {
    return freeModelsCache?.models ?? []
  }
}

/**
 * Reset health state (for testing or manual reset).
 */
export function resetHealth(agent?: string, model?: string): void {
  if (agent) {
    const key = healthKey(agent, model)
    healthState.delete(key)
  } else {
    healthState.clear()
  }
}

/**
 * Check Groq API rate limit status.
 * Returns usage info if API key is configured.
 */
export async function checkGroqStatus(): Promise<{
  available: boolean
  remainingRequests?: number
  resetAt?: string
} | null> {
  try {
    const configPath = `${process.env.HOME}/.groq/config.json`
    const config = await Bun.file(configPath).json()
    const apiKey = config.apiKey

    if (!apiKey) return null

    // Make a minimal request to check rate limit headers
    const response = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    })

    if (!response.ok) {
      return { available: false }
    }

    // Parse rate limit headers
    const remaining = response.headers.get('x-ratelimit-remaining-requests')
    const reset = response.headers.get('x-ratelimit-reset-requests')

    return {
      available: true,
      remainingRequests: remaining ? parseInt(remaining) : undefined,
      resetAt: reset ?? undefined,
    }
  } catch {
    return null
  }
}

/**
 * Check Cerebras API rate limit status.
 * Uses /v1/models endpoint and parses rate limit headers.
 * Cerebras returns: x-ratelimit-limit-requests-day, x-ratelimit-remaining-requests-day,
 *   x-ratelimit-remaining-tokens-minute, x-ratelimit-reset-requests-day
 */
export async function checkCerebrasStatus(): Promise<{
  available: boolean
  remainingRequestsDay?: number
  limitRequestsDay?: number
  remainingTokensMinute?: number
  resetRequestsDay?: string
} | null> {
  try {
    const keyPath = `${process.env.HOME}/.config/mk-agent/CEREBRAS_API_KEY`
    const apiKey = (await Bun.file(keyPath).text()).trim()

    if (!apiKey) return null

    const response = await fetch('https://api.cerebras.ai/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    })

    if (!response.ok) {
      return { available: false }
    }

    const remainingDay = response.headers.get('x-ratelimit-remaining-requests-day')
    const limitDay = response.headers.get('x-ratelimit-limit-requests-day')
    const remainingTokens = response.headers.get('x-ratelimit-remaining-tokens-minute')
    const resetDay = response.headers.get('x-ratelimit-reset-requests-day')

    return {
      available: true,
      remainingRequestsDay: remainingDay ? parseInt(remainingDay) : undefined,
      limitRequestsDay: limitDay ? parseInt(limitDay) : undefined,
      remainingTokensMinute: remainingTokens ? parseInt(remainingTokens) : undefined,
      resetRequestsDay: resetDay ?? undefined,
    }
  } catch {
    return null
  }
}

/**
 * Check Mistral API availability.
 * Mistral does not expose a billing API, but we can verify the key is valid
 * and the service is reachable by hitting /v1/models.
 */
export async function checkMistralStatus(): Promise<{
  available: boolean
  modelCount?: number
} | null> {
  try {
    const keyPath = `${process.env.HOME}/.config/mk-agent/MISTRAL_API_KEY`
    const content = (await Bun.file(keyPath).text()).trim()
    const match = content.match(/MISTRAL_API_KEY=(.+)/)
    const apiKey = match ? match[1].trim() : content

    if (!apiKey) return null

    const response = await fetch('https://api.mistral.ai/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    })

    if (!response.ok) {
      return { available: false }
    }

    const data = await response.json() as any
    return {
      available: true,
      modelCount: data.data?.length,
    }
  } catch {
    return null
  }
}

/**
 * Aggregate provider status check.
 * Runs all provider checks in parallel and returns a summary.
 * Cached for 60 seconds to avoid hammering APIs on every /api/health call.
 */
interface ProviderStatus {
  groq: Awaited<ReturnType<typeof checkGroqStatus>>
  cerebras: Awaited<ReturnType<typeof checkCerebrasStatus>>
  mistral: Awaited<ReturnType<typeof checkMistralStatus>>
  fetchedAt: number
}

let providerStatusCache: ProviderStatus | null = null

export async function checkAllProviderStatus(): Promise<Omit<ProviderStatus, 'fetchedAt'>> {
  // Return cached if fresh (60 seconds)
  if (providerStatusCache && Date.now() - providerStatusCache.fetchedAt < 60000) {
    const { fetchedAt, ...rest } = providerStatusCache
    return rest
  }

  const [groq, cerebras, mistral] = await Promise.all([
    checkGroqStatus(),
    checkCerebrasStatus(),
    checkMistralStatus(),
  ])

  providerStatusCache = { groq, cerebras, mistral, fetchedAt: Date.now() }
  return { groq, cerebras, mistral }
}
