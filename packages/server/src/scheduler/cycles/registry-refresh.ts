/**
 * Registry Refresh Cycle
 *
 * Re-detects agent CLIs and re-fetches provider models on a 6-hour interval.
 * Updates the DB and invalidates the registry cache.
 */

import type { SchedulerConfig } from '@mycelium/shared'
import { broadcast } from '../../sse'

/**
 * Run the registry refresh cycle:
 * 1. Detect all agent CLIs (version check, availability)
 * 2. Fetch models from all provider APIs
 * 3. Broadcast summary event
 */
export async function runRegistryRefreshCycle(_config: SchedulerConfig): Promise<void> {
  console.log('[Registry Refresh] Starting...')
  const startTime = Date.now()

  let agentsDetected = 0
  let providersRefreshed = 0

  // 1. Detect all agent CLIs
  try {
    const { detectAllAgents } = await import('../../agents/detect')
    const results = await detectAllAgents()
    const entries = Object.values(results)
    agentsDetected = entries.filter(r => r.detected).length
    const unavailable = entries.length - agentsDetected
    console.log(`[Registry Refresh] Detected ${agentsDetected} agents, ${unavailable} unavailable`)
  } catch (error) {
    console.error('[Registry Refresh] Agent detection failed:', error)
  }

  // 2. Fetch models from provider APIs
  try {
    const { fetchAllProviderModels, persistFetchedModels } = await import('../../agents/fetch-models')
    const results = await fetchAllProviderModels()
    const successfulResults = results.filter(r => !r.error)
    providersRefreshed = successfulResults.length
    const totalModels = successfulResults.reduce((sum, r) => sum + r.models.length, 0)
    console.log(`[Registry Refresh] Fetched models from ${providersRefreshed} providers (${totalModels} models)`)
    // Persist to DB
    if (successfulResults.length > 0) {
      await persistFetchedModels(successfulResults)
    }
  } catch (error) {
    console.error('[Registry Refresh] Model fetch failed:', error)
  }

  // 3. Reload registry cache
  try {
    const { reloadCache } = await import('../../agents/registry-cache')
    await reloadCache()
  } catch (error) {
    console.error('[Registry Refresh] Cache reload failed:', error)
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`[Registry Refresh] Complete (${elapsed}s)`)

  // Broadcast summary
  broadcast('registry:provider_refreshed', {
    type: 'registry:provider_refreshed',
    agents_detected: agentsDetected,
    providers_refreshed: providersRefreshed,
    timestamp: new Date().toISOString(),
  })
}
