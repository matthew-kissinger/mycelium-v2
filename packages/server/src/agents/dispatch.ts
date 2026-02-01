import { spawn, type Subprocess } from 'bun'
import { DEFAULT_AGENT_CONFIGS, type AgentType, type AgentExecuteResult } from '@mycelium/shared'

export interface DispatchOptions {
  agent: AgentType
  prompt: string
  cwd: string
  model?: string
  timeout?: number
  onOutput?: (chunk: string) => void
}

/**
 * Dispatch a task to a CLI agent.
 * This is a "dumb pipe" - it spawns the CLI and streams output.
 * All intelligence is in the agent, not here.
 */
export async function dispatch(options: DispatchOptions): Promise<AgentExecuteResult> {
  const { agent, prompt, cwd, model, timeout, onOutput } = options
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
          onOutput?.(chunk)
        } else {
          stderr += chunk
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
      return {
        success: false,
        output: output + '\n[TIMEOUT]',
        exit_code: 124, // Standard timeout exit code
        duration_seconds: (Date.now() - startTime) / 1000,
      }
    }

    const exitCode = await proc.exited
    const duration = (Date.now() - startTime) / 1000

    return {
      success: exitCode === 0,
      output: output || stderr,
      exit_code: exitCode,
      duration_seconds: duration,
      cost_usd: parseCostFromOutput(output),
    }
  } catch (error) {
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
 * IMPORTANT: These must match the actual CLI interfaces:
 * - Claude: claude -p "prompt" --model <model> --dangerously-skip-permissions
 * - Codex: codex -q "prompt" --model <model> --full-auto
 * - Gemini: gemini -p "prompt" --model <model>
 * - Cline: cline --yolo --mode act --output-format json [--model <model>] --task "prompt"
 * - Cursor: agent --print --output-format json --approve-mcps [--model <model>] --workspace <cwd> "prompt"
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
      // codex -q "prompt" --model gpt-5.2-codex --full-auto
      return [
        '-q', prompt,
        ...(model ? ['--model', model] : []),
        '--full-auto',
      ]

    case 'gemini':
      // gemini -p "prompt" --model gemini-3-flash-preview
      return [
        '-p', prompt,
        ...(model ? ['--model', model] : []),
      ]

    case 'cline':
      // cline --yolo --mode act --output-format json [--model <model>] --task "prompt"
      return [
        '--yolo',
        '--mode', 'act',
        '--output-format', 'json',
        ...(model ? ['--model', model] : []),
        '--task', prompt,
      ]

    case 'cursor':
      // agent --print --output-format json --approve-mcps [--model <model>] --workspace <cwd> "prompt"
      return [
        '--print',
        '--output-format', 'json',
        '--approve-mcps',
        ...(model ? ['--model', model] : []),
        ...(cwd ? ['--workspace', cwd] : []),
        prompt,
      ]

    default:
      return [prompt]
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
