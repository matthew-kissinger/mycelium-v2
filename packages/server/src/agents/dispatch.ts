import { spawn, type Subprocess } from 'bun'
import { DEFAULT_AGENT_CONFIGS, type AgentType, type AgentExecuteResult } from '@mycelium/shared'
import { registerProcess, unregisterProcess } from './registry'

export interface DispatchOptions {
  agent: AgentType
  prompt: string
  cwd: string
  model?: string
  timeout?: number
  taskId?: string  // Required for process registry tracking
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
  const { agent, prompt, cwd, model, timeout, taskId, onOutput, onStart } = options
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

  // Build command args based on agent type
  const args = buildAgentArgs(agent, prompt, model, cwd)

  // Switch cline model before dispatch if a specific model is requested
  if (agent === 'cline' && model) {
    await switchClineModel(model)
  }

  let proc: Subprocess<'ignore', 'pipe', 'pipe'>
  let output = ''
  let stderr = ''

  try {
    proc = spawn({
      cmd: [config.command, ...args],
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'ignore',
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
    const result = await Promise.race([
      Promise.all([
        readStream(stdoutReader, 'stdout'),
        readStream(stderrReader, 'stderr'),
        proc.exited,
      ]),
      new Promise<'timeout'>((resolve) =>
        setTimeout(() => resolve('timeout'), timeoutMs)
      ),
    ])

    if (result === 'timeout') {
      proc.kill()
      if (taskId) {
        unregisterProcess(taskId)
      }
      return {
        success: false,
        output: output + '\n[TIMEOUT]',
        exit_code: 124, // Standard timeout exit code
        duration_seconds: (Date.now() - startTime) / 1000,
      }
    }

    const exitCode = await proc.exited
    const duration = (Date.now() - startTime) / 1000

    // Unregister process on completion
    if (taskId) {
      unregisterProcess(taskId)
    }

    return {
      success: exitCode === 0,
      output: output || stderr,
      exit_code: exitCode,
      duration_seconds: duration,
      cost_usd: config.billing_type === 'per_use' ? parseCostFromOutput(output) : 0,
    }
  } catch (error) {
    // Unregister process on error
    if (taskId) {
      unregisterProcess(taskId)
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
 * - Cline: cline task new "prompt" --yolo --mode act
 * - Cursor: agent --print --output-format json [--model <model>] "prompt"
 */
function buildAgentArgs(agent: AgentType, prompt: string, model?: string, cwd?: string): string[] {
  switch (agent) {
    case 'claude':
      // claude -p "prompt" --model sonnet --dangerously-skip-permissions
      return [
        '-p', prompt,
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
      // cline task new "prompt" --yolo --mode act
      return [
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

    default:
      return [prompt]
  }
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

/** Current cline model to avoid redundant switches */
let currentClineModel: string | null = null

/**
 * Switch cline's OpenRouter model before dispatch.
 * Uses `cline auth` to change the model non-interactively.
 */
async function switchClineModel(model: string): Promise<void> {
  // Resolve short name to full OpenRouter ID
  const modelId = CLINE_MODEL_MAP[model] ?? model

  // Skip if already set to this model
  if (currentClineModel === modelId) return

  console.log(`[Dispatch] Switching cline model to ${modelId}`)

  try {
    const proc = spawn({
      cmd: ['cline', 'auth', '-p', 'openrouter', '-m', modelId],
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'ignore',
    })

    await proc.exited
    currentClineModel = modelId
    console.log(`[Dispatch] Cline model switched to ${modelId}`)
  } catch (error) {
    console.error(`[Dispatch] Failed to switch cline model:`, error)
    // Continue with current model rather than failing the task
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
