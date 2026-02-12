import type { AgentAdapter, AdapterOptions, ParsedUsage } from './types'

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
  'glm-5': 'z-ai/glm-5',
  'glm-4.7-flash': 'z-ai/glm-4.7-flash',
  'devstral': 'mistralai/devstral-2512',
}

/**
 * Resolve a model name: expand short names via CLINE_MODEL_MAP,
 * pass full OpenRouter model IDs through unchanged.
 */
function resolveModel(model: string): string {
  return CLINE_MODEL_MAP[model] ?? model
}

export const clineAdapter: AgentAdapter = {
  id: 'cline',

  buildArgs(options: AdapterOptions): string[] {
    const { prompt, model } = options
    const resolvedModel = model ? resolveModel(model) : null
    return [
      'task',
      prompt,
      '--yolo',
      '--act',
      '--json',
      '--timeout', '900',
      ...(resolvedModel ? ['-m', resolvedModel] : []),
    ]
  },

  buildEnv(): Record<string, string> {
    return {}
  },

  postProcessOutput(output: string): string {
    if (!output.trim()) return output

    // Parse NDJSON output from --json mode
    // Look for completion_result or text events
    const lines = output.trim().split('\n')
    const textParts: string[] = []
    let completionResult: string | null = null

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const event = JSON.parse(line)
        if (event.type === 'say' && event.say === 'completion_result' && event.text) {
          completionResult = event.text
        } else if (event.type === 'say' && event.say === 'text' && event.text) {
          textParts.push(event.text)
        }
      } catch {
        // Non-JSON line, include as raw text
        textParts.push(line)
      }
    }

    // Prefer completion_result if available, otherwise concatenate text events
    if (completionResult) return completionResult
    if (textParts.length > 0) return textParts.join('\n').trim()
    return output
  },

  tracksOpenRouterUsage(): boolean {
    return true
  },

  parseUsage(rawOutput: string): ParsedUsage | undefined {
    if (!rawOutput.trim()) return undefined
    try {
      const lines = rawOutput.trim().split('\n')
      let lastFinished: Record<string, unknown> | null = null

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const event = JSON.parse(line)
          if (event.type === 'say' && event.say === 'api_req_finished' && event.text) {
            // Token data is a JSON string inside the text field - double-parse
            lastFinished = JSON.parse(event.text)
          }
        } catch {
          // Non-JSON line, skip
        }
      }

      if (!lastFinished) return undefined
      const result: ParsedUsage = {}
      if (typeof lastFinished.tokensIn === 'number') result.input_tokens = lastFinished.tokensIn
      if (typeof lastFinished.tokensOut === 'number') result.output_tokens = lastFinished.tokensOut
      if (typeof lastFinished.cacheReads === 'number' && (lastFinished.cacheReads as number) > 0) {
        result.cache_read_tokens = lastFinished.cacheReads as number
      }
      if (typeof lastFinished.cacheWrites === 'number' && (lastFinished.cacheWrites as number) > 0) {
        result.cache_write_tokens = lastFinished.cacheWrites as number
      }
      if (typeof lastFinished.totalCost === 'number') result.cost_usd = lastFinished.totalCost
      return result
    } catch {
      return undefined
    }
  },
}

/**
 * Stub exports for backward compatibility.
 * The instance pool (cline-instances.ts) is dead code since Cline v2.x
 * removed `cline instance new/list/kill`. These stubs prevent import
 * errors in dispatch.ts and adapters/index.ts until they are cleaned up.
 */
export async function acquireClineAddress(): Promise<string> {
  return 'localhost:50052'
}

export function releaseClineAddress(_address: string): void {}

export async function getClineConfig(): Promise<{
  provider: string
  model: string
} | null> {
  return null
}
