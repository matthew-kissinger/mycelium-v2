#!/usr/bin/env bun
/**
 * Model Audit Script
 *
 * Collects model data from all agent CLIs and provider APIs,
 * cross-references against the current AGENT_MATRIX, and outputs
 * a report showing discrepancies and a draft updated matrix.
 *
 * Usage:
 *   bun run scripts/model-audit.ts                    # Full audit report
 *   bun run scripts/model-audit.ts --json             # JSON output
 *   bun run scripts/model-audit.ts --diff             # Show only changes
 *   bun run scripts/model-audit.ts --provider groq    # Single provider
 *   bun run scripts/model-audit.ts --agent codex      # Single agent
 */

import { $ } from 'bun'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { AGENT_MATRIX } from '../packages/shared/src/schemas/agent-matrix'

// =============================================================================
// Types
// =============================================================================

interface CollectedModel {
  provider: string
  model_id: string
  context_window: number | null   // in K (1K = 1000 tokens)
  max_output: number | null       // in K
  thinking: boolean
  vision: boolean
  cost_input: number | null       // per 1M tokens
  cost_output: number | null      // per 1M tokens
  free: boolean
  source: string                  // where we got this data
}

interface AgentModels {
  agent: string
  cli_version: string | null
  models: CollectedModel[]
  raw_output?: string
  error?: string
}

interface AuditResult {
  timestamp: string
  collectors: AgentModels[]
  openrouter_models: CollectedModel[]
  discrepancies: Discrepancy[]
  summary: AuditSummary
}

interface Discrepancy {
  type: 'missing_from_matrix' | 'missing_from_cli' | 'context_mismatch' | 'pricing_mismatch' | 'new_model'
  agent: string
  provider: string
  model_id: string
  details: string
  matrix_value?: string | number
  live_value?: string | number
}

interface AuditSummary {
  total_models_found: number
  total_in_matrix: number
  discrepancies_count: number
  agents_probed: string[]
  providers_probed: string[]
}

// =============================================================================
// CLI helpers
// =============================================================================

async function runCommand(cmd: string[], timeoutMs = 15000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const proc = Bun.spawn(cmd, {
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'ignore',
      env: process.env,
    })

    const timeout = setTimeout(() => proc.kill(), timeoutMs)
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    const exitCode = await proc.exited
    clearTimeout(timeout)

    return { stdout, stderr, exitCode }
  } catch (e) {
    return { stdout: '', stderr: String(e), exitCode: 1 }
  }
}

function parseContext(s: string): number | null {
  // Handle "1.0M" format (millions of tokens -> K)
  const mMatch = s.match(/([\d.]+)M/i)
  if (mMatch) return Math.round(parseFloat(mMatch[1]) * 1000)
  // Handle "200K" format
  const kMatch = s.match(/([\d.]+)K/i)
  if (kMatch) return Math.round(parseFloat(kMatch[1]))
  // Handle raw numbers
  const num = parseFloat(s)
  if (!isNaN(num)) return num > 10000 ? Math.round(num / 1000) : Math.round(num)
  return null
}

// =============================================================================
// Collectors
// =============================================================================

/**
 * Pi CLI - BEST source. Shows models from 7+ providers with context, max-output, thinking, images.
 */
async function collectFromPi(): Promise<AgentModels> {
  const { stdout, stderr, exitCode } = await runCommand(['pi', '--list-models'], 30000)
  if (exitCode !== 0) {
    return { agent: 'pi', cli_version: null, models: [], error: stderr }
  }

  // Get version
  const versionResult = await runCommand(['pi', '--version'])
  const version = versionResult.stdout.trim().split('\n')[0] || null

  const models: CollectedModel[] = []
  const lines = stdout.split('\n').filter(l => l.trim() && !l.startsWith('provider'))

  for (const line of lines) {
    // Format: provider        model                                          context  max-out  thinking  images
    const parts = line.trim().split(/\s{2,}/)
    if (parts.length < 4) continue

    const [provider, modelId, contextStr, maxOutStr, thinkingStr, imagesStr] = parts
    if (!provider || !modelId) continue

    models.push({
      provider: provider.trim(),
      model_id: modelId.trim(),
      context_window: parseContext(contextStr || ''),
      max_output: parseContext(maxOutStr || ''),
      thinking: thinkingStr?.trim() === 'yes',
      vision: imagesStr?.trim() === 'yes',
      cost_input: null,
      cost_output: null,
      free: ['groq', 'cerebras'].includes(provider.trim()),
      source: 'pi --list-models',
    })
  }

  return { agent: 'pi', cli_version: version, models }
}

/**
 * Copilot CLI - Model list from --help --model
 */
async function collectFromCopilot(): Promise<AgentModels> {
  const { stdout, stderr } = await runCommand(['copilot', '--help'])
  const versionResult = await runCommand(['copilot', '--version'])
  const version = versionResult.stdout.trim().split('\n')[0] || null

  // Extract model choices from help text
  const modelSection = stdout.match(/--model\s+<model>\s+.*?\(choices:\s*([\s\S]*?)\)/)?.[1] || ''
  const modelIds = [...modelSection.matchAll(/"([^"]+)"/g)].map(m => m[1])

  const models: CollectedModel[] = modelIds.map(id => ({
    provider: 'github-copilot',
    model_id: id,
    context_window: id.includes('5.2-codex') ? 272 : 128,
    max_output: null,
    thinking: id.includes('opus') || id.includes('gpt-5'),
    vision: true,
    cost_input: null,
    cost_output: null,
    free: false,
    source: 'copilot --help',
  }))

  return { agent: 'copilot', cli_version: version, models }
}

/**
 * Codex CLI - Read from ~/.codex/models_cache.json
 */
async function collectFromCodex(): Promise<AgentModels> {
  const versionResult = await runCommand(['codex', '--version'])
  const version = versionResult.stdout.trim().split('\n')[0] || null

  const cachePath = join(homedir(), '.codex', 'models_cache.json')
  if (!existsSync(cachePath)) {
    return { agent: 'codex', cli_version: version, models: [], error: 'No models_cache.json found' }
  }

  try {
    const data = JSON.parse(readFileSync(cachePath, 'utf-8'))
    const rawModels = data.models || []

    const models: CollectedModel[] = rawModels.map((m: any) => ({
      provider: 'openai',
      model_id: m.slug || m.id || 'unknown',
      context_window: m.context_window ? Math.round(m.context_window / 1000) : null,
      max_output: null,
      thinking: (m.supported_reasoning_levels || []).length > 0,
      vision: false,
      cost_input: null,
      cost_output: null,
      free: false,
      source: 'codex models_cache.json',
    }))

    return { agent: 'codex', cli_version: version, models }
  } catch (e) {
    return { agent: 'codex', cli_version: version, models: [], error: String(e) }
  }
}

/**
 * Cursor (agent) CLI - Model list from `agent models`
 */
async function collectFromCursor(): Promise<AgentModels> {
  const { stdout, stderr } = await runCommand(['agent', 'models'])
  const versionResult = await runCommand(['agent', '--version'])
  const version = versionResult.stdout.trim().split('\n')[0] || null

  const models: CollectedModel[] = []
  const lines = stdout.split('\n').filter(l => l.trim() && !l.startsWith('Available') && !l.startsWith('Tip') && !l.startsWith('['))

  for (const line of lines) {
    // Format: model-id - Display Name  (default)/(current)
    const match = line.match(/^(\S+)\s+-\s+(.+?)(?:\s+\((default|current)\))?$/)
    if (match) {
      const [, modelId, displayName] = match
      models.push({
        provider: 'cursor',
        model_id: modelId,
        context_window: null,  // Cursor doesn't show context
        max_output: null,
        thinking: displayName.includes('Thinking') || modelId.includes('codex'),
        vision: false,
        cost_input: null,
        cost_output: null,
        free: false,
        source: 'agent models',
      })
    }
  }

  return { agent: 'cursor', cli_version: version, models }
}

/**
 * Gemini CLI - version + model testing
 */
async function collectFromGemini(): Promise<AgentModels> {
  const versionResult = await runCommand(['gemini', '--version'])
  const version = versionResult.stdout.trim().split('\n')[0] || null

  // Gemini doesn't have a model listing command. Known models from Google AI:
  const knownModels = ['gemini-3-pro-preview', 'gemini-3-flash-preview']

  const models: CollectedModel[] = knownModels.map(id => ({
    provider: 'google',
    model_id: id,
    context_window: 1000,
    max_output: null,
    thinking: true,
    vision: true,
    cost_input: null,
    cost_output: null,
    free: true,  // Google AI subscription
    source: 'gemini known-models',
  }))

  return { agent: 'gemini', cli_version: version, models }
}

/**
 * OpenCode CLI
 */
async function collectFromOpenCode(): Promise<AgentModels> {
  const versionResult = await runCommand(['opencode', '--version'])
  const version = versionResult.stdout.trim().split('\n')[0] || null

  // OpenCode uses provider/model format, free tier has opencode/ prefix
  // No listing command available
  return {
    agent: 'opencode',
    cli_version: version,
    models: [],
    error: 'No model listing command available - uses opencode/ prefix for free models',
  }
}

/**
 * Vibe CLI
 */
async function collectFromVibe(): Promise<AgentModels> {
  const versionResult = await runCommand(['vibe', '--version'])
  const version = versionResult.stdout.trim().split('\n')[0] || null

  // Vibe auto-selects models, no --model flag
  return {
    agent: 'vibe',
    cli_version: version,
    models: [],
    error: 'No model listing - auto-selects via Mistral API',
  }
}

/**
 * Kiro CLI
 */
async function collectFromKiro(): Promise<AgentModels> {
  const versionResult = await runCommand(['q', '--version'])
  const version = versionResult.stdout.trim().split('\n')[0] || null

  // Kiro uses AWS routing, no model selection
  return {
    agent: 'kiro',
    cli_version: version,
    models: [],
    error: 'No model listing - AWS routes automatically',
  }
}

/**
 * Claude CLI
 */
async function collectFromClaude(): Promise<AgentModels> {
  const versionResult = await runCommand(['claude', '--version'])
  const version = versionResult.stdout.trim().split('\n')[0] || null

  // Claude uses opus/sonnet/haiku aliases
  const models: CollectedModel[] = ['opus', 'sonnet', 'haiku'].map(id => ({
    provider: 'anthropic',
    model_id: id,
    context_window: 200,
    max_output: id === 'opus' ? 128 : 64,
    thinking: id !== 'haiku',
    vision: true,
    cost_input: null,
    cost_output: null,
    free: false,
    source: 'claude known-models',
  }))

  return { agent: 'claude', cli_version: version, models }
}

/**
 * OpenRouter API - comprehensive pricing and model data
 */
async function collectFromOpenRouter(): Promise<CollectedModel[]> {
  const envPath = join(homedir(), '.config', 'mk-agent', 'env')
  let apiKey = ''

  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf-8')
    const match = envContent.match(/OPENROUTER_API_KEY=["']?([^\s"']+)/)
    if (match) apiKey = match[1]
  }

  if (!apiKey) {
    apiKey = process.env.OPENROUTER_API_KEY || ''
  }

  if (!apiKey) {
    console.error('[OpenRouter] No API key found')
    return []
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    if (!response.ok) {
      console.error(`[OpenRouter] API error: ${response.status}`)
      return []
    }

    const data = await response.json() as { data: any[] }

    return data.data.map((m: any) => {
      const pricing = m.pricing || {}
      const costIn = pricing.prompt ? parseFloat(pricing.prompt) * 1_000_000 : null
      const costOut = pricing.completion ? parseFloat(pricing.completion) * 1_000_000 : null

      return {
        provider: 'openrouter',
        model_id: m.id,
        context_window: m.context_length ? Math.round(m.context_length / 1000) : null,
        max_output: m.top_provider?.max_completion_tokens ? Math.round(m.top_provider.max_completion_tokens / 1000) : null,
        thinking: false,  // Not reliably reported by OpenRouter
        vision: (m.architecture?.modality || '').includes('image'),
        cost_input: costIn,
        cost_output: costOut,
        free: m.id.endsWith(':free') || (costIn === 0 && costOut === 0),
        source: 'openrouter api',
      }
    })
  } catch (e) {
    console.error('[OpenRouter] Fetch error:', e)
    return []
  }
}

// =============================================================================
// Cross-reference and Audit
// =============================================================================

function findDiscrepancies(
  collectors: AgentModels[],
  openrouterModels: CollectedModel[],
): Discrepancy[] {
  const discrepancies: Discrepancy[] = []

  // Build lookup maps
  const piModels = collectors.find(c => c.agent === 'pi')?.models || []
  const piByProvider = new Map<string, Map<string, CollectedModel>>()
  for (const m of piModels) {
    if (!piByProvider.has(m.provider)) piByProvider.set(m.provider, new Map())
    piByProvider.get(m.provider)!.set(m.model_id, m)
  }

  const orByModel = new Map<string, CollectedModel>()
  for (const m of openrouterModels) {
    orByModel.set(m.model_id, m)
  }

  // Check each agent in the matrix
  for (const agentCap of AGENT_MATRIX) {
    const collector = collectors.find(c => c.agent === agentCap.agent)

    for (const providerModels of agentCap.providers) {
      for (const matrixModel of providerModels.models) {
        // Skip meta-models
        if (matrixModel.id === 'auto' || matrixModel.id === 'default') continue

        // Check if model exists in CLI data
        let liveModel: CollectedModel | undefined

        if (agentCap.agent === 'copilot') {
          liveModel = collector?.models.find(m => m.model_id === matrixModel.id)
          if (!liveModel) {
            discrepancies.push({
              type: 'missing_from_cli',
              agent: agentCap.agent,
              provider: providerModels.provider,
              model_id: matrixModel.id,
              details: `Model ${matrixModel.id} in matrix but not in copilot --help`,
            })
          }
        }

        if (agentCap.agent === 'codex') {
          liveModel = collector?.models.find(m => m.model_id === matrixModel.id)
          if (!liveModel) {
            discrepancies.push({
              type: 'missing_from_cli',
              agent: agentCap.agent,
              provider: providerModels.provider,
              model_id: matrixModel.id,
              details: `Model ${matrixModel.id} in matrix but not in codex models_cache`,
            })
          }
        }

        if (agentCap.agent === 'cursor') {
          liveModel = collector?.models.find(m => m.model_id === matrixModel.id)
          if (!liveModel) {
            discrepancies.push({
              type: 'missing_from_cli',
              agent: agentCap.agent,
              provider: providerModels.provider,
              model_id: matrixModel.id,
              details: `Model ${matrixModel.id} in matrix but not in agent models`,
            })
          }
        }

        // Check context window via pi data
        const piProviderMap = piByProvider.get(
          providerModels.provider === 'github' ? 'github-copilot' : providerModels.provider
        )
        const piModel = piProviderMap?.get(matrixModel.id)
        if (piModel && piModel.context_window && matrixModel.context) {
          if (Math.abs(piModel.context_window - matrixModel.context) > 5) {
            discrepancies.push({
              type: 'context_mismatch',
              agent: agentCap.agent,
              provider: providerModels.provider,
              model_id: matrixModel.id,
              details: `Context mismatch: matrix=${matrixModel.context}K, live=${piModel.context_window}K`,
              matrix_value: matrixModel.context,
              live_value: piModel.context_window,
            })
          }
        }

        // Check pricing via OpenRouter
        if (providerModels.provider === 'openrouter' && matrixModel.costIn !== undefined) {
          const orModel = orByModel.get(matrixModel.id)
          if (orModel && orModel.cost_input !== null) {
            const priceDiff = Math.abs((matrixModel.costIn || 0) - orModel.cost_input)
            if (priceDiff > 0.1) {
              discrepancies.push({
                type: 'pricing_mismatch',
                agent: agentCap.agent,
                provider: providerModels.provider,
                model_id: matrixModel.id,
                details: `Input price: matrix=$${matrixModel.costIn}/M, live=$${orModel.cost_input?.toFixed(2)}/M`,
                matrix_value: matrixModel.costIn,
                live_value: orModel.cost_input,
              })
            }
          }
        }
      }
    }

    // Check for NEW models in CLI that aren't in matrix
    if (collector && collector.models.length > 0) {
      const matrixModelIds = new Set(
        agentCap.providers.flatMap(p => p.models.map(m => m.id))
      )

      for (const liveModel of collector.models) {
        // Only check models from the same agent's provider
        if (!matrixModelIds.has(liveModel.model_id)) {
          discrepancies.push({
            type: 'new_model',
            agent: agentCap.agent,
            provider: liveModel.provider,
            model_id: liveModel.model_id,
            details: `New model in ${liveModel.source}: ${liveModel.model_id} (context=${liveModel.context_window}K)`,
          })
        }
      }
    }
  }

  return discrepancies
}

// =============================================================================
// Reporting
// =============================================================================

function printReport(result: AuditResult) {
  console.log('\n' + '='.repeat(80))
  console.log('  MODEL AUDIT REPORT')
  console.log('  ' + result.timestamp)
  console.log('='.repeat(80))

  // CLI versions
  console.log('\n--- Agent CLI Versions ---')
  for (const c of result.collectors) {
    const status = c.error ? `ERROR: ${c.error}` : `${c.models.length} models`
    console.log(`  ${c.agent.padEnd(12)} v${c.cli_version || '?'}  ${status}`)
  }

  // OpenRouter stats
  console.log(`\n  openrouter    ${result.openrouter_models.length} models from API`)

  // Discrepancies by type
  const byType = new Map<string, Discrepancy[]>()
  for (const d of result.discrepancies) {
    if (!byType.has(d.type)) byType.set(d.type, [])
    byType.get(d.type)!.push(d)
  }

  if (result.discrepancies.length === 0) {
    console.log('\n--- No discrepancies found! Matrix is up to date. ---')
  } else {
    console.log(`\n--- ${result.discrepancies.length} Discrepancies Found ---\n`)

    const typeLabels: Record<string, string> = {
      missing_from_cli: 'In matrix but NOT in CLI',
      missing_from_matrix: 'In CLI but NOT in matrix',
      context_mismatch: 'Context window mismatch',
      pricing_mismatch: 'Pricing mismatch',
      new_model: 'New models available',
    }

    for (const [type, items] of byType) {
      console.log(`  ${typeLabels[type] || type} (${items.length}):`)
      for (const d of items.slice(0, 20)) {
        console.log(`    [${d.agent}/${d.provider}] ${d.model_id}`)
        console.log(`      ${d.details}`)
      }
      if (items.length > 20) {
        console.log(`    ... and ${items.length - 20} more`)
      }
      console.log()
    }
  }

  // Per-provider model counts from pi
  const piCollector = result.collectors.find(c => c.agent === 'pi')
  if (piCollector) {
    const providerCounts = new Map<string, number>()
    for (const m of piCollector.models) {
      providerCounts.set(m.provider, (providerCounts.get(m.provider) || 0) + 1)
    }
    console.log('--- Models by Provider (from pi --list-models) ---')
    for (const [provider, count] of [...providerCounts].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${provider.padEnd(20)} ${count} models`)
    }
  }

  // Summary
  console.log('\n--- Summary ---')
  console.log(`  Models in matrix:      ${result.summary.total_in_matrix}`)
  console.log(`  Models found live:     ${result.summary.total_models_found}`)
  console.log(`  Discrepancies:         ${result.summary.discrepancies_count}`)
  console.log(`  Agents probed:         ${result.summary.agents_probed.join(', ')}`)
  console.log(`  Providers probed:      ${result.summary.providers_probed.join(', ')}`)
  console.log()
}

function printProviderModels(result: AuditResult, provider: string) {
  const piCollector = result.collectors.find(c => c.agent === 'pi')
  if (!piCollector) {
    console.log(`No pi data available for provider: ${provider}`)
    return
  }

  const providerModels = piCollector.models.filter(m => m.provider === provider)
  console.log(`\n--- ${provider} models (${providerModels.length}) ---`)
  console.log('  ' + 'model_id'.padEnd(50) + 'context'.padEnd(10) + 'max_out'.padEnd(10) + 'thinking'.padEnd(10) + 'vision')
  for (const m of providerModels) {
    console.log(`  ${m.model_id.padEnd(50)} ${String(m.context_window || '?').padEnd(10)} ${String(m.max_output || '?').padEnd(10)} ${String(m.thinking).padEnd(10)} ${m.vision}`)
  }
}

function printAgentModels(result: AuditResult, agent: string) {
  const collector = result.collectors.find(c => c.agent === agent)
  if (!collector) {
    console.log(`No data for agent: ${agent}`)
    return
  }

  console.log(`\n--- ${agent} models (${collector.models.length}) ---`)
  console.log(`  CLI version: ${collector.cli_version || '?'}`)
  if (collector.error) console.log(`  Note: ${collector.error}`)

  for (const m of collector.models) {
    console.log(`  ${m.model_id.padEnd(50)} ctx=${m.context_window || '?'}K  ${m.source}`)
  }

  // Show matrix models for comparison
  const matrixAgent = AGENT_MATRIX.find(a => a.agent === agent)
  if (matrixAgent) {
    console.log(`\n  Matrix models:`)
    for (const p of matrixAgent.providers) {
      for (const m of p.models) {
        const inCli = collector.models.some(cm => cm.model_id === m.id)
        const marker = m.id === 'auto' || m.id === 'default' ? '  ' : inCli ? 'OK' : '!!'
        console.log(`  [${marker}] ${m.id.padEnd(40)} ctx=${m.context}K  [${p.provider}]`)
      }
    }
  }
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const args = process.argv.slice(2)
  const jsonOutput = args.includes('--json')
  const diffOnly = args.includes('--diff')
  const providerFilter = args.includes('--provider') ? args[args.indexOf('--provider') + 1] : null
  const agentFilter = args.includes('--agent') ? args[args.indexOf('--agent') + 1] : null

  if (!jsonOutput) {
    console.log('Collecting model data from all sources...\n')
  }

  // Run all collectors in parallel
  const [pi, copilot, codex, cursor, gemini, opencode, vibe, kiro, claude, openrouterModels] = await Promise.all([
    collectFromPi(),
    collectFromCopilot(),
    collectFromCodex(),
    collectFromCursor(),
    collectFromGemini(),
    collectFromOpenCode(),
    collectFromVibe(),
    collectFromKiro(),
    collectFromClaude(),
    collectFromOpenRouter(),
  ])

  const collectors = [pi, copilot, codex, cursor, gemini, opencode, vibe, kiro, claude]

  // Cross-reference
  const discrepancies = findDiscrepancies(collectors, openrouterModels)

  // Count matrix models
  let matrixModelCount = 0
  for (const a of AGENT_MATRIX) {
    for (const p of a.providers) {
      matrixModelCount += p.models.length
    }
  }

  // Unique providers from pi
  const providers = new Set(pi.models.map(m => m.provider))

  const result: AuditResult = {
    timestamp: new Date().toISOString(),
    collectors,
    openrouter_models: openrouterModels,
    discrepancies,
    summary: {
      total_models_found: collectors.reduce((sum, c) => sum + c.models.length, 0) + openrouterModels.length,
      total_in_matrix: matrixModelCount,
      discrepancies_count: discrepancies.length,
      agents_probed: collectors.map(c => c.agent),
      providers_probed: [...providers],
    },
  }

  // Output
  if (jsonOutput) {
    // Don't include full openrouter model list in JSON (too large)
    const jsonResult = {
      ...result,
      openrouter_models: `${openrouterModels.length} models (use --provider openrouter for details)`,
    }
    console.log(JSON.stringify(jsonResult, null, 2))
  } else if (providerFilter) {
    printProviderModels(result, providerFilter)
  } else if (agentFilter) {
    printAgentModels(result, agentFilter)
  } else if (diffOnly) {
    if (result.discrepancies.length === 0) {
      console.log('No discrepancies found.')
    } else {
      for (const d of result.discrepancies) {
        console.log(`[${d.type}] ${d.agent}/${d.provider}: ${d.model_id} - ${d.details}`)
      }
    }
  } else {
    printReport(result)
  }

  // Save raw data for reference
  const outputPath = join(homedir(), '.config', 'mycelium-v2', 'model-audit.json')
  const outputData = {
    ...result,
    openrouter_model_count: openrouterModels.length,
    openrouter_models: undefined,  // Don't save full list
  }

  try {
    const dir = join(homedir(), '.config', 'mycelium-v2')
    await Bun.write(join(dir, 'model-audit.json'), JSON.stringify(outputData, null, 2))
    if (!jsonOutput) {
      console.log(`Raw data saved to: ${outputPath}`)
    }
  } catch (e) {
    // Ignore save errors
  }
}

main().catch(console.error)
