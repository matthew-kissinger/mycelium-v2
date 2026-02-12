import type { AgentType, ProviderType, AgentExecuteResult } from '@mycelium/shared'

/**
 * Options passed to each adapter's buildArgs/buildEnv methods.
 * Subset of DispatchOptions relevant to adapter logic.
 */
export interface AdapterOptions {
  prompt: string
  model?: string
  provider?: ProviderType
  cwd?: string
  sessionId?: string
  /** Cline instance gRPC address (cline adapter only) */
  clineAddress?: string | null
  /** Max turns safety cap for agents that support it (claude, cursor) */
  maxTurns?: number
}

/**
 * Structured usage data parsed from agent output.
 * Each adapter that supports structured output implements parseUsage()
 * to extract these fields from raw CLI output.
 */
export interface ParsedUsage {
  input_tokens?: number
  output_tokens?: number
  cache_read_tokens?: number
  cache_write_tokens?: number
  thinking_tokens?: number
  tool_tokens?: number
  cost_usd?: number
  session_id?: string
  model_used?: string
  num_turns?: number
  api_duration_ms?: number
  /** Copilot premium request count */
  premium_requests?: number
}

/**
 * Per-agent adapter interface.
 * Each agent implements this to encapsulate its CLI differences.
 */
export interface AgentAdapter {
  /** Agent identifier matching AgentType */
  id: AgentType

  /** Build CLI arguments for this agent */
  buildArgs(options: AdapterOptions): string[]

  /** Build extra environment variables for this agent */
  buildEnv(options: AdapterOptions): Record<string, string>

  /**
   * If defined, the agent receives prompt via stdin instead of CLI args.
   * Returns the string to write to stdin.
   */
  prepareStdin?(prompt: string): string

  /**
   * Post-process the raw output (e.g. strip kiro banner).
   * If not defined, output is used as-is.
   */
  postProcessOutput?(output: string): string

  /**
   * Parse structured usage data from raw CLI output.
   * Called with the ORIGINAL stdout (before postProcessOutput) and stderr.
   * Returns undefined if no usage data could be parsed.
   */
  parseUsage?(rawOutput: string, stderr?: string): ParsedUsage | undefined

  /**
   * Agent-specific setup before spawn (e.g. cline model switching).
   * Called after buildArgs/buildEnv but before process spawn.
   */
  preSpawn?(options: AdapterOptions): Promise<void>

  /**
   * Agent-specific resource acquisition (e.g. cline instance pool).
   * Returns a cleanup function to release resources.
   */
  acquireResources?(options: AdapterOptions): Promise<() => void>

  /**
   * Whether this agent tracks OpenRouter usage for cost calculation.
   */
  tracksOpenRouterUsage?(options: AdapterOptions): boolean
}
