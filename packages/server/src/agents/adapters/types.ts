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
