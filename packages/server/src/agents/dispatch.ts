import { spawn, type Subprocess } from 'bun'
import { DEFAULT_AGENT_CONFIGS, type AgentType, type AgentExecuteResult, type ProviderType } from '@mycelium/shared'
import { registerProcess, unregisterProcess } from './registry'
import { acquireClineInstance, releaseClineInstance } from './cline-instances'
import { checkOpenRouterCredits } from './health'
import { readFileSync, existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

export interface DispatchOptions {
  agent: AgentType
  prompt: string
  cwd: string
  model?: string
  provider?: ProviderType  // For agents with multiple providers
  timeout?: number
  taskId?: string  // Required for process registry tracking
  sessionId?: string  // Claude session ID for --resume on retry
  onOutput?: (chunk: string, stream?: 'stdout' | 'stderr') => void
  onStart?: (pid: number) => void  // Called with PID after process spawns
}

/**
 * Dispatch a task to a CLI agent.
 * This is a "dumb pipe" - it spawns the CLI and streams output.
 * All intelligence is in the agent, not here.
 *
 * Registers process with the registry for cleanup on cancel/shutdown.
 */
export async function dispatch(options: DispatchOptions): Promise<AgentExecuteResult> {
  const { agent, prompt, cwd, model, provider, timeout, taskId, sessionId, onOutput, onStart } = options
  const config = DEFAULT_AGENT_CONFIGS[agent]

  if (!config) {
    return {
      success: false,
      output: `Unknown agent: ${agent}`,
      exit_code: 1,
      duration_seconds: 0,
    }
  }

  const timeoutMs = (timeout ?? config.timeout_seconds) * 1000
  const startTime = Date.now()

  // Special case: kiro needs prompt via stdin
  if (agent === 'kiro') {
    return dispatchKiro(prompt, cwd, taskId, onOutput, onStart, timeoutMs)
  }

  // For cline, acquire a dedicated instance to avoid gRPC conflicts
  let clineAddress: string | null = null
  let openRouterUsageBefore: number | null = null
  if (agent === 'cline') {
    clineAddress = await acquireClineInstance()
    // Track OpenRouter usage for cost calculation
    const credits = await checkOpenRouterCredits()
    openRouterUsageBefore = credits?.usage ?? null
  }

  // Track OpenRouter usage for pi when using openrouter provider
  if (agent === 'pi' && (provider === 'openrouter' || !provider)) {
    const credits = await checkOpenRouterCredits()
    openRouterUsageBefore = credits?.usage ?? null
  }

  // Build command args based on agent type
  const args = buildAgentArgs(agent, prompt, model, cwd, clineAddress, provider, sessionId)

  // Switch cline model/provider before dispatch if specified
  if (agent === 'cline' && (model || provider)) {
    await switchClineModel(model ?? 'moonshotai/kimi-k2.5', clineAddress, provider as 'openrouter' | 'cline' ?? 'openrouter')
  }

  let proc: Subprocess<'ignore', 'pipe', 'pipe'>
  let output = ''
  let stderr = ''

  // Build environment for agents that need special env vars
  const env = buildAgentEnv(agent, provider)

  try {
    proc = spawn({
      cmd: [config.command, ...args],
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'ignore',
      env: { ...process.env, ...env },
    })

    // Register process for cleanup on cancel/shutdown
    if (taskId) {
      registerProcess(taskId, proc, agent, cwd)
    }

    // Notify caller of PID for persistence
    if (proc.pid) {
      onStart?.(proc.pid)
    }

    // Stream stdout
    const stdoutReader = proc.stdout.getReader()
    const stderrReader = proc.stderr.getReader()

    // Read streams concurrently
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
          // Also stream stderr for live logs
          onOutput?.(chunk, 'stderr')
        }
      }
    }

    // Race between completion and timeout
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
      // Cancel dangling stream readers so they don't hang
      stdoutReader.cancel().catch(() => {})
      stderrReader.cancel().catch(() => {})
      if (taskId) {
        unregisterProcess(taskId)
      }
      // Release cline instance on timeout
      if (clineAddress) {
        releaseClineInstance(clineAddress)
      }
      return {
        success: false,
        output: output + '\n[TIMEOUT]',
        exit_code: 124, // Standard timeout exit code
        duration_seconds: (Date.now() - startTime) / 1000,
      }
    }

    // Clear timeout timer on successful completion
    clearTimeout(timeoutId)

    // proc.exited already resolved as part of Promise.all above
    const exitCode = (result as [void, void, number])[2]
    const duration = (Date.now() - startTime) / 1000

    // Unregister process on completion
    if (taskId) {
      unregisterProcess(taskId)
    }

    // Release cline instance on completion
    if (clineAddress) {
      releaseClineInstance(clineAddress)
    }

    // Calculate cost for per_use billing
    let cost_usd: number | undefined
    if (config.billing_type === 'per_use') {
      // For agents using OpenRouter, calculate from usage delta
      if ((agent === 'cline' || agent === 'pi') && openRouterUsageBefore !== null) {
        const creditsAfter = await checkOpenRouterCredits()
        if (creditsAfter) {
          cost_usd = creditsAfter.usage - openRouterUsageBefore
        }
      }
      // Fallback to parsing output
      if (cost_usd === undefined) {
        cost_usd = parseCostFromOutput(output)
      }
    } else if (config.billing_type === 'free') {
      cost_usd = 0
    } else {
      cost_usd = 0
    }

    // Estimate token usage
    const tokens = estimateTokens(prompt, output)

    return {
      success: exitCode === 0,
      output: output || stderr,
      exit_code: exitCode,
      duration_seconds: duration,
      cost_usd,
      input_tokens: tokens.input_tokens,
      output_tokens: tokens.output_tokens,
    }
  } catch (error) {
    // Unregister process on error
    if (taskId) {
      unregisterProcess(taskId)
    }
    // Release cline instance on error
    if (clineAddress) {
      releaseClineInstance(clineAddress)
    }
    return {
      success: false,
      output: error instanceof Error ? error.message : String(error),
      exit_code: 1,
      duration_seconds: (Date.now() - startTime) / 1000,
    }
  }
}

/**
 * Build CLI arguments for each agent type.
 * Each agent has different CLI patterns.
 *
 * IMPORTANT: These must match the actual CLI interfaces (verified Feb 2026):
 * - Claude: claude -p "prompt" --model <model> --dangerously-skip-permissions
 * - Codex: codex exec "prompt" --model <model> --full-auto
 * - Gemini: gemini "prompt" --model <model> --yolo
 * - Cline: cline task new "prompt" --yolo --mode act [--address <addr>]
 * - Cursor: agent --print --output-format json [--model <model>] "prompt"
 * - Kiro: kiro-cli chat --no-interactive (piped prompt)
 * - Vibe: vibe -p "prompt" --output text
 * - Pi: pi -p "prompt" --provider <provider> --model <model>
 * - OpenCode: opencode run "prompt" [-m model]
 * - Copilot: copilot -p "prompt" [--model <model>] --allow-all-tools
 */
function buildAgentArgs(
  agent: AgentType,
  prompt: string,
  model?: string,
  cwd?: string,
  clineAddress?: string | null,
  provider?: ProviderType,
  sessionId?: string
): string[] {
  switch (agent) {
    case 'claude':
      // claude -p "prompt" --model sonnet --dangerously-skip-permissions
      // --resume <sessionId> continues a previous session (for retries)
      return [
        ...(sessionId ? ['--resume', sessionId] : ['-p', prompt]),
        ...(model ? ['--model', model] : []),
        '--dangerously-skip-permissions',
      ]

    case 'codex':
      // codex exec "prompt" --model gpt-5.2-codex --full-auto
      return [
        'exec',
        prompt,
        ...(model ? ['--model', model] : []),
        '--full-auto',
      ]

    case 'gemini':
      // gemini "prompt" --model gemini-2.5-flash --yolo
      return [
        prompt,
        ...(model ? ['--model', model] : []),
        '--yolo',
      ]

    case 'cline':
      // cline task new "prompt" --yolo --mode act [--address <addr>]
      return [
        ...(clineAddress ? ['--address', clineAddress] : []),
        'task', 'new',
        prompt,
        '--yolo',
        '--mode', 'act',
      ]

    case 'cursor':
      // agent --print --output-format json [--model <model>] "prompt"
      return [
        '--print',
        '--output-format', 'json',
        ...(model ? ['--model', model] : []),
        prompt,
      ]

    // New agents (Feb 2026)
    case 'kiro':
      // kiro-cli chat --no-interactive
      // Note: prompt is piped via stdin, not as arg
      return ['chat', '--no-interactive', '--trust-all-tools']

    case 'vibe':
      // vibe -p "prompt" --output text
      return [
        '-p', prompt,
        '--output', 'text',
      ]

    case 'pi':
      // pi -p "prompt" --provider <provider> --model <model>
      return [
        '-p', prompt,
        ...(provider ? ['--provider', mapProviderToPi(provider)] : ['--provider', 'openrouter']),
        ...(model ? ['--model', model] : []),
      ]

    case 'opencode':
      // opencode run "prompt" [-m model]
      return [
        'run',
        ...(model ? ['-m', model] : ['-m', 'opencode/kimi-k2.5-free']),
        prompt,
      ]

    case 'copilot':
      // copilot -p "prompt" [--model <model>] --allow-all-tools --no-ask-user
      return [
        '-p', prompt,
        ...(model ? ['--model', model] : ['--model', 'claude-sonnet-4.5']),
        '--allow-all-tools',
        '--no-ask-user',
      ]

    default:
      return [prompt]
  }
}

/**
 * Map ProviderType to pi CLI provider name.
 */
function mapProviderToPi(provider: ProviderType): string {
  switch (provider) {
    case 'openrouter': return 'openrouter'
    case 'groq': return 'groq'
    case 'cerebras': return 'cerebras'
    case 'mistral': return 'mistral'
    case 'google': return 'google'
    case 'anthropic': return 'anthropic'
    case 'openai': return 'openai'
    default: return 'openrouter'
  }
}

/**
 * Build environment variables for agents that need them.
 */
function buildAgentEnv(agent: AgentType, provider?: ProviderType): Record<string, string> {
  const env: Record<string, string> = {}
  const configDir = join(homedir(), '.config', 'mk-agent')

  // Copilot needs GH_TOKEN
  if (agent === 'copilot') {
    const token = getCopilotToken()
    if (token) {
      env.GH_TOKEN = token
    }
  }

  // Pi needs API keys based on provider
  if (agent === 'pi') {
    const p = provider ?? 'openrouter'
    if (p === 'openrouter') {
      const keyPath = join(configDir, 'OPENROUTER_API_KEY')
      if (existsSync(keyPath)) {
        // File contains: export OPENROUTER_API_KEY=...
        const content = readFileSync(keyPath, 'utf-8')
        const match = content.match(/OPENROUTER_API_KEY=(.+)/)
        if (match) env.OPENROUTER_API_KEY = match[1].trim()
      }
    } else if (p === 'mistral') {
      const keyPath = join(configDir, 'MISTRAL_API_KEY')
      if (existsSync(keyPath)) {
        const content = readFileSync(keyPath, 'utf-8')
        const match = content.match(/MISTRAL_API_KEY=(.+)/)
        if (match) env.MISTRAL_API_KEY = match[1].trim()
      }
    } else if (p === 'groq') {
      // Groq key is in ~/.groq/config.json
      const apiKey = getGroqApiKey()
      if (apiKey) env.GROQ_API_KEY = apiKey
    } else if (p === 'cerebras') {
      const keyPath = join(configDir, 'CEREBRAS_API_KEY')
      if (existsSync(keyPath)) {
        const content = readFileSync(keyPath, 'utf-8').trim()
        env.CEREBRAS_API_KEY = content
      }
    }
  }

  // Vibe needs MISTRAL_API_KEY
  if (agent === 'vibe') {
    const keyPath = join(configDir, 'MISTRAL_API_KEY')
    if (existsSync(keyPath)) {
      const content = readFileSync(keyPath, 'utf-8')
      const match = content.match(/MISTRAL_API_KEY=(.+)/)
      if (match) env.MISTRAL_API_KEY = match[1].trim()
    }
  }

  return env
}

// =============================================================================
// Cline model switching
// =============================================================================

/**
 * Map short model names to OpenRouter model IDs.
 * Discovery creates tasks with short names like "kimi-k2.5" or "deepseek-v3.2".
 */
const CLINE_MODEL_MAP: Record<string, string> = {
  'kimi-k2.5': 'moonshotai/kimi-k2.5',
  'kimi-k2': 'moonshotai/kimi-k2-0905',
  'kimi-k2-thinking': 'moonshotai/kimi-k2-thinking',
  'deepseek-v3.2': 'deepseek/deepseek-v3.2',
  'deepseek-r1': 'deepseek/deepseek-r1-0528',
  'qwen3-coder': 'qwen/qwen3-coder',
  'qwen3-coder-next': 'qwen/qwen3-coder-next',
  'glm-4.7': 'z-ai/glm-4.7',
  'glm-4.7-flash': 'z-ai/glm-4.7-flash',
  'devstral': 'mistralai/devstral-2512',
}

/** Track current model and provider per cline instance address */
const clineModelByInstance = new Map<string, string>()
const clineProviderByInstance = new Map<string, string>()

/**
 * Switch cline's model and optionally provider before dispatch.
 * Uses `cline config set` for fast switching.
 */
async function switchClineModel(
  model: string,
  instanceAddress?: string | null,
  provider: 'openrouter' | 'cline' = 'openrouter'
): Promise<void> {
  // Resolve short name to full OpenRouter ID
  const modelId = CLINE_MODEL_MAP[model] ?? model
  const address = instanceAddress ?? 'default'

  const currentModel = clineModelByInstance.get(address)
  const currentProvider = clineProviderByInstance.get(address)

  // Skip if already set correctly
  if (currentModel === modelId && currentProvider === provider) return

  console.log(`[Dispatch] Switching cline to ${provider}/${modelId} on ${address}`)

  try {
    // Build config set args
    const configArgs: string[] = []
    if (currentProvider !== provider) {
      configArgs.push(`act-mode-api-provider=${provider}`)
    }
    if (provider === 'openrouter' && currentModel !== modelId) {
      configArgs.push(`act-mode-open-router-model-id=${modelId}`)
    }

    if (configArgs.length === 0) return

    const proc = spawn({
      cmd: [
        'cline',
        ...(instanceAddress ? ['--address', instanceAddress] : []),
        'config', 'set',
        ...configArgs,
      ],
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'ignore',
    })

    await proc.exited
    clineModelByInstance.set(address, modelId)
    clineProviderByInstance.set(address, provider)
    console.log(`[Dispatch] Cline switched to ${provider}/${modelId} on ${address}`)
  } catch (error) {
    console.error(`[Dispatch] Failed to switch cline config:`, error)
    // Continue with current config rather than failing the task
  }
}

/**
 * Get current cline config for an instance.
 */
export async function getClineConfig(instanceAddress?: string | null): Promise<{
  provider: string
  model: string
} | null> {
  try {
    const proc = spawn({
      cmd: [
        'cline',
        ...(instanceAddress ? ['--address', instanceAddress] : []),
        'config', 'list', '-F', 'plain',
      ],
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const output = await new Response(proc.stdout).text()
    await proc.exited

    const providerMatch = output.match(/act-mode-api-provider:\s*(\S+)/)
    const modelMatch = output.match(/act-mode-open-router-model-id:\s*(\S+)/)

    return {
      provider: providerMatch?.[1] ?? 'unknown',
      model: modelMatch?.[1] ?? 'unknown',
    }
  } catch {
    return null
  }
}

/**
 * Estimate token counts from prompt and output text.
 * Rough heuristic: ~4 characters per token (standard for English text/code).
 * Also parses explicit token counts from agent output when available.
 */
function estimateTokens(prompt: string, output: string): { input_tokens: number; output_tokens: number } {
  // Try parsing explicit token counts from output first
  const inputMatch = output.match(/input[_\s]tokens[:\s]*(\d[\d,]*)/i)
  const outputMatch = output.match(/output[_\s]tokens[:\s]*(\d[\d,]*)/i)
  const totalTokensMatch = output.match(/total[_\s]tokens[:\s]*(\d[\d,]*)/i)

  if (inputMatch && outputMatch) {
    return {
      input_tokens: parseInt(inputMatch[1].replace(/,/g, '')),
      output_tokens: parseInt(outputMatch[1].replace(/,/g, '')),
    }
  }

  // Fallback: estimate from character count (~4 chars per token)
  return {
    input_tokens: Math.ceil(prompt.length / 4),
    output_tokens: Math.ceil(output.length / 4),
  }
}

/**
 * Parse cost from agent output if present.
 * Agents often report cost in their output.
 */
function parseCostFromOutput(output: string): number | undefined {
  // Look for patterns like "Cost: $0.0234" or "cost_usd: 0.0234"
  const patterns = [
    /Cost:\s*\$?([\d.]+)/i,
    /cost_usd[:\s]*([\d.]+)/i,
    /total[_\s]cost[:\s]*\$?([\d.]+)/i,
  ]

  for (const pattern of patterns) {
    const match = output.match(pattern)
    if (match) {
      return parseFloat(match[1])
    }
  }

  return undefined
}

// =============================================================================
// Groq API dispatch (no CLI available - requires TTY)
// =============================================================================

/**
 * Get Groq API key from config file.
 */
function getGroqApiKey(): string | null {
  const configPath = join(homedir(), '.groq', 'config.json')
  if (!existsSync(configPath)) return null
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    return config.apiKey ?? null
  } catch {
    return null
  }
}

// =============================================================================
// Kiro special handling (stdin for prompt)
// =============================================================================

/**
 * Dispatch to Kiro with prompt via stdin.
 * Kiro CLI doesn't accept prompt as arg, only via stdin.
 */
export async function dispatchKiro(
  prompt: string,
  cwd: string,
  taskId?: string,
  onOutput?: (chunk: string, stream?: 'stdout' | 'stderr') => void,
  onStart?: (pid: number) => void,
  timeoutMs?: number
): Promise<AgentExecuteResult> {
  const startTime = Date.now()
  const timeout = timeoutMs ?? 1800000

  try {
    const proc = spawn({
      cmd: ['kiro-cli', 'chat', '--no-interactive', '--trust-all-tools'],
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'pipe',
    })

    if (taskId) {
      registerProcess(taskId, proc, 'kiro', cwd)
    }

    if (proc.pid) {
      onStart?.(proc.pid)
    }

    // Write prompt to stdin and close
    // Bun's stdin is a FileSink, not a stream
    try {
      proc.stdin.write(prompt)
      proc.stdin.end()
    } catch (stdinError) {
      // Broken pipe - process may have exited before we could write
      console.error('[Dispatch] Kiro stdin write failed:', stdinError)
    }

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

    const stdoutReader = proc.stdout.getReader()
    const stderrReader = proc.stderr.getReader()

    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const result = await Promise.race([
      Promise.all([
        readStream(stdoutReader, 'stdout'),
        readStream(stderrReader, 'stderr'),
        proc.exited,
      ]),
      new Promise<'timeout'>((resolve) => {
        timeoutId = setTimeout(() => resolve('timeout'), timeout)
      }),
    ])

    if (result === 'timeout') {
      proc.kill()
      stdoutReader.cancel().catch(() => {})
      stderrReader.cancel().catch(() => {})
      if (taskId) unregisterProcess(taskId)
      return {
        success: false,
        output: output + '\n[TIMEOUT]',
        exit_code: 124,
        duration_seconds: (Date.now() - startTime) / 1000,
      }
    }

    clearTimeout(timeoutId)
    const exitCode = (result as [void, void, number])[2]
    if (taskId) unregisterProcess(taskId)

    // Skip first ~30 lines of kiro output (banner/startup)
    const lines = output.split('\n')
    const cleanOutput = lines.slice(30).join('\n').trim()

    return {
      success: exitCode === 0,
      output: cleanOutput || output,
      exit_code: exitCode,
      duration_seconds: (Date.now() - startTime) / 1000,
      cost_usd: 0, // Subscription
    }
  } catch (error) {
    if (taskId) unregisterProcess(taskId)
    return {
      success: false,
      output: error instanceof Error ? error.message : String(error),
      exit_code: 1,
      duration_seconds: (Date.now() - startTime) / 1000,
    }
  }
}

// =============================================================================
// Copilot environment setup
// =============================================================================

/**
 * Get Copilot token for GH_TOKEN env var.
 */
function getCopilotToken(): string | null {
  const tokenPath = join(homedir(), '.config', 'mk-agent', 'COPILOT_TOKEN')
  if (!existsSync(tokenPath)) return null
  try {
    return readFileSync(tokenPath, 'utf-8').trim()
  } catch {
    return null
  }
}
