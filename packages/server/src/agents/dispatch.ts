import { spawn } from 'bun'
import { DEFAULT_AGENT_CONFIGS, type AgentType, type AgentExecuteResult, type ProviderType } from '@mycelium/shared'
import { registerProcess, unregisterProcess } from './registry'
import { checkOpenRouterCredits } from './health'
import { getCachedAgent, getCachedProvider } from './registry-cache'
import { getAdapter } from './adapters'
import type { AdapterOptions } from './adapters'

export interface DispatchOptions {
  agent: AgentType
  prompt: string
  cwd: string
  model?: string
  provider?: ProviderType  // For agents with multiple providers
  timeout?: number
  taskId?: string  // Required for process registry tracking
  sessionId?: string  // Claude session ID for --resume on retry
  extraEnv?: Record<string, string>  // Additional env vars merged into spawn environment
  onOutput?: (chunk: string, stream?: 'stdout' | 'stderr') => void
  onStart?: (pid: number) => void  // Called with PID after process spawns
}

/**
 * Estimate token counts from prompt and output text.
 * Parses explicit counts from agent output, falls back to ~4 chars/token.
 */
function estimateTokens(prompt: string, output: string): { input_tokens: number; output_tokens: number } {
  const inputMatch = output.match(/input[_\s]tokens[:\s]*(\d[\d,]*)/i)
  const outputMatch = output.match(/output[_\s]tokens[:\s]*(\d[\d,]*)/i)

  if (inputMatch && outputMatch) {
    return {
      input_tokens: parseInt(inputMatch[1].replace(/,/g, '')),
      output_tokens: parseInt(outputMatch[1].replace(/,/g, '')),
    }
  }

  return {
    input_tokens: Math.ceil(prompt.length / 4),
    output_tokens: Math.ceil(output.length / 4),
  }
}

/**
 * Parse cost from agent output if present.
 */
function parseCostFromOutput(output: string): number | undefined {
  const patterns = [
    /Cost:\s*\$?([\d.]+)/i,
    /cost_usd[:\s]*([\d.]+)/i,
    /total[_\s]cost[:\s]*\$?([\d.]+)/i,
  ]
  for (const pattern of patterns) {
    const match = output.match(pattern)
    if (match) return parseFloat(match[1])
  }
  return undefined
}

/**
 * Dispatch a task to a CLI agent.
 * This is a "dumb pipe" - it spawns the CLI and streams output.
 * All intelligence is in the agent, not here.
 *
 * Registers process with the registry for cleanup on cancel/shutdown.
 */
export async function dispatch(options: DispatchOptions): Promise<AgentExecuteResult> {
  const { agent, prompt, cwd, model, provider, timeout, taskId, sessionId, extraEnv, onOutput, onStart } = options

  // Look up adapter for this agent
  const adapter = getAdapter(agent)
  if (!adapter) {
    return {
      success: false,
      output: `Unknown agent: ${agent}`,
      exit_code: 1,
      duration_seconds: 0,
    }
  }

  // Registry cache is the source of truth, with static defaults as base
  let config = DEFAULT_AGENT_CONFIGS[agent]
  const cachedAgent = getCachedAgent(agent)
  if (cachedAgent) {
    config = {
      ...config,
      command: cachedAgent.command,
      timeout_seconds: cachedAgent.timeout_seconds ?? config?.timeout_seconds ?? 1800,
    }
  }

  if (!config) {
    return {
      success: false,
      output: `No config for agent: ${agent}`,
      exit_code: 1,
      duration_seconds: 0,
    }
  }

  const timeoutMs = (timeout ?? config.timeout_seconds) * 1000
  const startTime = Date.now()

  // Build adapter options
  const adapterOpts: AdapterOptions = { prompt, model, provider, cwd, sessionId }

  // Acquire resources (e.g. cline instance pool)
  let releaseResources: (() => void) | undefined
  if (adapter.acquireResources) {
    const { acquireClineAddress } = require('./adapters/cline')
    const address = await acquireClineAddress()
    adapterOpts.clineAddress = address
    releaseResources = () => {
      const { releaseClineAddress } = require('./adapters/cline')
      releaseClineAddress(address)
    }
  }

  // Track OpenRouter usage for cost calculation
  let openRouterUsageBefore: number | null = null
  if (adapter.tracksOpenRouterUsage?.(adapterOpts)) {
    const credits = await checkOpenRouterCredits()
    openRouterUsageBefore = credits?.usage ?? null
  }

  // Pre-spawn hook (e.g. cline model switching)
  if (adapter.preSpawn) {
    await adapter.preSpawn(adapterOpts)
  }

  // Build command args and env via adapter
  const args = adapter.buildArgs(adapterOpts)
  const env = adapter.buildEnv(adapterOpts)
  const usesStdin = !!adapter.prepareStdin

  try {
    const proc = spawn({
      cmd: [config.command, ...args],
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: usesStdin ? 'pipe' : 'ignore',
      env: { ...process.env, ...env, ...extraEnv },
    })

    // Register process for cleanup on cancel/shutdown
    if (taskId) {
      registerProcess(taskId, proc, agent, cwd)
    }

    // Notify caller of PID for persistence
    if (proc.pid) {
      onStart?.(proc.pid)
    }

    // Write prompt to stdin for stdin-based agents (e.g. kiro)
    if (usesStdin && adapter.prepareStdin && proc.stdin) {
      try {
        const stdinData = adapter.prepareStdin(prompt)
        proc.stdin.write(stdinData)
        proc.stdin.end()
      } catch (stdinError) {
        console.error(`[Dispatch] ${agent} stdin write failed:`, stdinError)
      }
    }

    // Stream output and race against timeout
    const stdoutReader = proc.stdout.getReader()
    const stderrReader = proc.stderr.getReader()

    let output = ''
    let stderr = ''

    const readStream = async (
      reader: ReadableStreamDefaultReader<Uint8Array>,
      target: 'stdout' | 'stderr'
    ) => {
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        if (target === 'stdout') {
          output += chunk
          onOutput?.(chunk, 'stdout')
        } else {
          stderr += chunk
          onOutput?.(chunk, 'stderr')
        }
      }
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const result = await Promise.race([
      Promise.all([
        readStream(stdoutReader, 'stdout'),
        readStream(stderrReader, 'stderr'),
        proc.exited,
      ]),
      new Promise<'timeout'>((resolve) => {
        timeoutId = setTimeout(() => resolve('timeout'), timeoutMs)
      }),
    ])

    if (result === 'timeout') {
      proc.kill()
      stdoutReader.cancel().catch(() => {})
      stderrReader.cancel().catch(() => {})
      if (taskId) unregisterProcess(taskId)
      releaseResources?.()
      return {
        success: false,
        output: output + '\n[TIMEOUT]',
        exit_code: 124,
        duration_seconds: (Date.now() - startTime) / 1000,
      }
    }

    clearTimeout(timeoutId)
    const exitCode = (result as [void, void, number])[2]
    const duration = (Date.now() - startTime) / 1000

    if (taskId) unregisterProcess(taskId)
    releaseResources?.()

    // Post-process output (e.g. strip kiro banner)
    let finalOutput = output
    if (adapter.postProcessOutput) {
      finalOutput = adapter.postProcessOutput(finalOutput)
    }

    // Calculate cost for per_use billing via registry cache
    let billingType = config.billing_type
    if (cachedAgent?.default_provider) {
      const providerRow = getCachedProvider(cachedAgent.default_provider)
      if (providerRow?.billing) {
        billingType = providerRow.billing as typeof billingType
      }
    }

    let cost_usd: number | undefined
    if (billingType === 'per_use') {
      if (openRouterUsageBefore !== null) {
        const creditsAfter = await checkOpenRouterCredits()
        if (creditsAfter) {
          cost_usd = creditsAfter.usage - openRouterUsageBefore
        }
      }
      if (cost_usd === undefined) {
        cost_usd = parseCostFromOutput(finalOutput)
      }
    } else {
      cost_usd = 0
    }

    const tokens = estimateTokens(prompt, finalOutput)

    return {
      success: exitCode === 0,
      output: finalOutput || stderr,
      exit_code: exitCode,
      duration_seconds: duration,
      cost_usd,
      input_tokens: tokens.input_tokens,
      output_tokens: tokens.output_tokens,
    }
  } catch (error) {
    if (taskId) unregisterProcess(taskId)
    releaseResources?.()
    return {
      success: false,
      output: error instanceof Error ? error.message : String(error),
      exit_code: 1,
      duration_seconds: (Date.now() - startTime) / 1000,
    }
  }
}
