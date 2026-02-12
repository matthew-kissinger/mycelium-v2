import { z } from 'zod'
import { AgentType } from './task'

// Billing type: per_use = pay-per-token, subscription = monthly plan, free = no cost
export const BillingType = z.enum(['per_use', 'subscription', 'free'])
export type BillingType = z.infer<typeof BillingType>

// Agent configuration
export const AgentConfig = z.object({
  type: AgentType,
  command: z.string(), // CLI command to run
  timeout_seconds: z.number().default(1800), // 30 min default
  max_turns: z.number().default(50),
  supports_streaming: z.boolean().default(true),
  billing_type: BillingType.default('subscription'),
})
export type AgentConfig = z.infer<typeof AgentConfig>

// Default agent configurations
// IMPORTANT: Cursor uses 'agent' CLI command, not 'cursor'
export const DEFAULT_AGENT_CONFIGS: Record<string, AgentConfig> = {
  claude: {
    type: 'claude',
    command: 'claude',
    timeout_seconds: 2400, // 40 min - complex tasks need more time
    max_turns: 50,
    supports_streaming: true,
    billing_type: 'subscription',
  },
  codex: {
    type: 'codex',
    command: 'codex',
    timeout_seconds: 1800,
    max_turns: 50,
    supports_streaming: true,
    billing_type: 'subscription',
  },
  gemini: {
    type: 'gemini',
    command: 'gemini',
    timeout_seconds: 1800,
    max_turns: 30,
    supports_streaming: true,
    billing_type: 'subscription',  // Google AI Pro subscription
  },
  cline: {
    type: 'cline',
    command: 'cline',
    timeout_seconds: 1800,
    max_turns: 30,
    supports_streaming: false,
    billing_type: 'per_use',
  },
  cursor: {
    type: 'cursor',
    command: 'agent',  // Cursor CLI is 'agent', not 'cursor'
    timeout_seconds: 1800,
    max_turns: 30,
    supports_streaming: false,
    billing_type: 'subscription',
  },
  // New agents (Feb 2026)
  kiro: {
    type: 'kiro',
    command: 'kiro-cli',  // or 'q' alias
    timeout_seconds: 1800,
    max_turns: 30,
    supports_streaming: true,
    billing_type: 'subscription',  // AWS/Kiro account
  },
  vibe: {
    type: 'vibe',
    command: 'vibe',
    timeout_seconds: 1800,
    max_turns: 30,
    supports_streaming: true,
    billing_type: 'per_use',  // Mistral credits
  },
  pi: {
    type: 'pi',
    command: 'pi',
    timeout_seconds: 1800,
    max_turns: 30,
    supports_streaming: true,
    billing_type: 'per_use',  // Depends on provider (OpenRouter, etc.)
  },
  opencode: {
    type: 'opencode',
    command: 'opencode',
    timeout_seconds: 3600, // 1hr - free rate-limited models need more time
    max_turns: 30,
    supports_streaming: false,
    billing_type: 'free',  // OpenCode Zen free models
  },
  copilot: {
    type: 'copilot',
    command: 'copilot',
    timeout_seconds: 1800,
    max_turns: 30,
    supports_streaming: false,
    billing_type: 'subscription',  // GitHub Copilot plan
  },
}

// Agent execution request
export const AgentExecuteRequest = z.object({
  task_id: z.string().uuid(),
  agent: AgentType,
  model: z.string().optional(),
  prompt: z.string(),
  repo_path: z.string(),
  timeout_seconds: z.number().optional(),
})
export type AgentExecuteRequest = z.infer<typeof AgentExecuteRequest>

// Agent execution result
export const AgentExecuteResult = z.object({
  success: z.boolean(),
  output: z.string(),
  exit_code: z.number(),
  duration_seconds: z.number(),
  cost_usd: z.number().optional(),
  input_tokens: z.number().optional(),
  output_tokens: z.number().optional(),
  cache_read_tokens: z.number().optional(),
  cache_write_tokens: z.number().optional(),
  thinking_tokens: z.number().optional(),
  session_id: z.string().optional(),
  model_used: z.string().optional(),
  num_turns: z.number().optional(),
  api_duration_ms: z.number().optional(),
  premium_requests: z.number().optional(),
})
export type AgentExecuteResult = z.infer<typeof AgentExecuteResult>
