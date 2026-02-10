/**
 * Provider Model Fetching
 *
 * Fetches model lists from provider APIs using API keys stored in
 * ~/.config/mk-agent/ files. Each provider has a dedicated fetcher that
 * normalizes the response into FetchedModel objects.
 *
 * Uses dynamic imports for credentials and DB modules to avoid circular
 * dependency issues. Each fetch call has a 10s timeout.
 */

// =============================================================================
// Types
// =============================================================================

export interface FetchedModel {
  model_id: string
  short_name?: string
  context_window?: number
  cost_input?: number  // per 1M tokens
  cost_output?: number
  thinking?: boolean
  vision?: boolean
  free?: boolean
}

export interface FetchResult {
  provider: string
  models: FetchedModel[]
  error?: string
}

// =============================================================================
// Helpers
// =============================================================================

const FETCH_TIMEOUT_MS = 10_000

/**
 * Wrapper around fetch() with a 10s AbortController timeout.
 */
async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    return res
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Convert per-token cost string to per-1M-token cost.
 * Provider APIs typically return cost per token as a string.
 */
function perTokenToPerMillion(perToken: string | number | null | undefined): number | undefined {
  if (perToken === null || perToken === undefined) return undefined
  const value = typeof perToken === 'string' ? parseFloat(perToken) : perToken
  if (isNaN(value)) return undefined
  return value * 1_000_000
}

// =============================================================================
// Provider-specific fetchers
// =============================================================================

/**
 * OpenRouter: GET https://openrouter.ai/api/v1/models
 * Response shape: { data: [{ id, name, context_length, pricing: { prompt, completion } }] }
 * Pricing values are per-token as strings. Free models have pricing "0".
 */
async function fetchOpenRouter(apiKey: string): Promise<FetchedModel[]> {
  const res = await fetchWithTimeout('https://openrouter.ai/api/v1/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  })
  if (!res.ok) throw new Error(`OpenRouter API ${res.status}: ${res.statusText}`)

  const json = await res.json() as {
    data: Array<{
      id: string
      name?: string
      context_length?: number
      pricing?: { prompt?: string; completion?: string }
    }>
  }

  return (json.data ?? []).map(m => {
    const costIn = perTokenToPerMillion(m.pricing?.prompt)
    const costOut = perTokenToPerMillion(m.pricing?.completion)
    const isFree = m.pricing?.prompt === '0' && m.pricing?.completion === '0'

    return {
      model_id: m.id,
      short_name: m.name,
      context_window: m.context_length,
      cost_input: costIn,
      cost_output: costOut,
      free: isFree || undefined,
    }
  })
}

/**
 * Anthropic: GET https://api.anthropic.com/v1/models
 * Response shape: { data: [{ id, display_name }] }
 */
async function fetchAnthropic(apiKey: string): Promise<FetchedModel[]> {
  const res = await fetchWithTimeout('https://api.anthropic.com/v1/models', {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
  })
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${res.statusText}`)

  const json = await res.json() as {
    data: Array<{
      id: string
      display_name?: string
    }>
  }

  return (json.data ?? []).map(m => ({
    model_id: m.id,
    short_name: m.display_name,
  }))
}

/**
 * OpenAI: GET https://api.openai.com/v1/models
 * Response shape: { data: [{ id }] }
 */
async function fetchOpenAI(apiKey: string): Promise<FetchedModel[]> {
  const res = await fetchWithTimeout('https://api.openai.com/v1/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  })
  if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${res.statusText}`)

  const json = await res.json() as {
    data: Array<{ id: string }>
  }

  return (json.data ?? []).map(m => ({
    model_id: m.id,
  }))
}

/**
 * Groq: GET https://api.groq.com/openai/v1/models
 * Response shape: { data: [{ id, context_window }] }
 */
async function fetchGroq(apiKey: string): Promise<FetchedModel[]> {
  const res = await fetchWithTimeout('https://api.groq.com/openai/v1/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  })
  if (!res.ok) throw new Error(`Groq API ${res.status}: ${res.statusText}`)

  const json = await res.json() as {
    data: Array<{
      id: string
      context_window?: number
    }>
  }

  return (json.data ?? []).map(m => ({
    model_id: m.id,
    context_window: m.context_window,
    free: true,
  }))
}

/**
 * Cerebras: GET https://api.cerebras.ai/v1/models
 * Response shape: { data: [{ id }] }
 */
async function fetchCerebras(apiKey: string): Promise<FetchedModel[]> {
  const res = await fetchWithTimeout('https://api.cerebras.ai/v1/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  })
  if (!res.ok) throw new Error(`Cerebras API ${res.status}: ${res.statusText}`)

  const json = await res.json() as {
    data: Array<{ id: string }>
  }

  return (json.data ?? []).map(m => ({
    model_id: m.id,
    free: true,
  }))
}

/**
 * Mistral: GET https://api.mistral.ai/v1/models
 * Response shape: { data: [{ id, max_context_length }] }
 */
async function fetchMistral(apiKey: string): Promise<FetchedModel[]> {
  const res = await fetchWithTimeout('https://api.mistral.ai/v1/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  })
  if (!res.ok) throw new Error(`Mistral API ${res.status}: ${res.statusText}`)

  const json = await res.json() as {
    data: Array<{
      id: string
      max_context_length?: number
    }>
  }

  return (json.data ?? []).map(m => ({
    model_id: m.id,
    context_window: m.max_context_length,
  }))
}

/**
 * Google: GET https://generativelanguage.googleapis.com/v1beta/models?key=<key>
 * Response shape: { models: [{ name, inputTokenLimit }] }
 * Model names arrive as "models/gemini-1.5-pro" - the prefix is stripped.
 */
async function fetchGoogle(apiKey: string): Promise<FetchedModel[]> {
  const res = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
  )
  if (!res.ok) throw new Error(`Google AI API ${res.status}: ${res.statusText}`)

  const json = await res.json() as {
    models: Array<{
      name: string
      inputTokenLimit?: number
    }>
  }

  return (json.models ?? []).map(m => ({
    model_id: m.name.replace(/^models\//, ''),
    context_window: m.inputTokenLimit,
    free: true,
  }))
}

// =============================================================================
// Provider Registry
// =============================================================================

interface ProviderEntry {
  id: string
  credentialKey: string
  fetcher: (apiKey: string) => Promise<FetchedModel[]>
}

const PROVIDERS: ProviderEntry[] = [
  { id: 'openrouter',  credentialKey: 'OPENROUTER_API_KEY', fetcher: fetchOpenRouter },
  { id: 'anthropic',   credentialKey: 'ANTHROPIC_API_KEY',  fetcher: fetchAnthropic },
  { id: 'openai',      credentialKey: 'OPENAI_API_KEY',     fetcher: fetchOpenAI },
  { id: 'groq',        credentialKey: 'GROQ_API_KEY',       fetcher: fetchGroq },
  { id: 'cerebras',    credentialKey: 'CEREBRAS_API_KEY',    fetcher: fetchCerebras },
  { id: 'mistral',     credentialKey: 'MISTRAL_API_KEY',     fetcher: fetchMistral },
  { id: 'google',      credentialKey: 'GOOGLE_API_KEY',      fetcher: fetchGoogle },
]

// =============================================================================
// Public API
// =============================================================================

/**
 * Fetch models from a specific provider.
 * Returns a FetchResult with the provider name, fetched models array, and an
 * optional error string if the fetch failed or no API key is configured.
 */
export async function fetchProviderModels(providerId: string): Promise<FetchResult> {
  const entry = PROVIDERS.find(p => p.id === providerId)
  if (!entry) {
    console.log(`[ModelFetch] Unknown provider: ${providerId}`)
    return { provider: providerId, models: [], error: `Unknown provider: ${providerId}` }
  }

  // Dynamic import to avoid circular deps
  const { getCredential } = await import('./credentials')
  const apiKey = getCredential(entry.credentialKey)

  if (!apiKey) {
    console.log(`[ModelFetch] No API key for ${providerId}, skipping`)
    return { provider: providerId, models: [], error: 'No API key configured' }
  }

  try {
    const models = await entry.fetcher(apiKey)
    console.log(`[ModelFetch] ${providerId}: fetched ${models.length} models`)
    return { provider: providerId, models }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error(`[ModelFetch] ${providerId} failed: ${msg}`)
    return { provider: providerId, models: [], error: msg }
  }
}

/**
 * Fetch models from all providers that have API keys configured.
 * Runs sequentially with a 1s delay between each provider to avoid rate limits.
 * Only fetches from providers that have API keys configured.
 */
export async function fetchAllProviderModels(): Promise<FetchResult[]> {
  console.log('[ModelFetch] Starting fetch from all providers...')

  // Dynamic import to get credential checker
  const { getCredential } = await import('./credentials')

  const results: FetchResult[] = []

  for (let i = 0; i < PROVIDERS.length; i++) {
    const entry = PROVIDERS[i]
    const apiKey = getCredential(entry.credentialKey)

    if (!apiKey) {
      console.log(`[ModelFetch] ${entry.id}: no API key, skipping`)
      continue
    }

    try {
      const models = await entry.fetcher(apiKey)
      console.log(`[ModelFetch] ${entry.id}: fetched ${models.length} models`)
      results.push({ provider: entry.id, models })
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error(`[ModelFetch] ${entry.id} failed: ${msg}`)
      results.push({ provider: entry.id, models: [], error: msg })
    }

    // 1s delay between providers (skip after the last one)
    if (i < PROVIDERS.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  const successCount = results.filter(r => !r.error).length
  const totalModels = results.reduce((sum, r) => sum + r.models.length, 0)
  console.log(
    `[ModelFetch] Complete: ${successCount} providers refreshed, ${totalModels} total models`
  )

  return results
}

/**
 * Persist fetched models to the database and reload the in-memory cache.
 *
 * For each model in the results, calls upsertModel with the composite ID
 * (provider/model_id) and source 'api_fetch'. Updates provider status with
 * model count via updateProviderStatus. After all writes, calls reloadCache
 * to refresh the in-memory registry.
 *
 * Uses dynamic imports for DB and cache modules to avoid circular deps.
 */
export async function persistFetchedModels(results: FetchResult[]): Promise<void> {
  const { upsertModel, updateProviderStatus } = await import('../db/registry-queries')
  const { reloadCache } = await import('./registry-cache')

  const now = new Date().toISOString()
  let totalPersisted = 0

  for (const result of results) {
    if (result.error || result.models.length === 0) {
      // Update provider status to reflect the error if present
      if (result.error) {
        try {
          updateProviderStatus(result.provider, 'error')
        } catch {
          // Non-critical - provider row may not exist yet
        }
      }
      continue
    }

    // Persist each fetched model
    for (const model of result.models) {
      const compositeId = `${result.provider}/${model.model_id}`

      try {
        upsertModel(compositeId, {
          provider_id: result.provider,
          model_id: model.model_id,
          short_name: model.short_name ?? null,
          context_window: model.context_window ?? null,
          cost_input: model.cost_input ?? null,
          cost_output: model.cost_output ?? null,
          thinking: model.thinking ?? null,
          vision: model.vision ?? null,
          free: model.free ?? null,
          available: true,
          source: 'api_fetch',
        })
        totalPersisted++
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[ModelFetch] Failed to persist ${compositeId}: ${msg}`)
      }
    }

    // Update provider status with model count
    try {
      updateProviderStatus(result.provider, 'available', undefined, {
        models_count: result.models.length,
        last_fetched: now,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[ModelFetch] Failed to update provider status for ${result.provider}: ${msg}`)
    }
  }

  // Reload the in-memory cache with all new data
  await reloadCache()

  console.log(`[ModelFetch] Persisted ${totalPersisted} models to database, cache reloaded`)
}
