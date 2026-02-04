import { z } from 'zod'
import { AgentType } from './task'

// Billing type: per_use = pay-per-token (e.g. Cline via OpenRouter), subscription = monthly plan
export const BillingType = z.enum(['per_use', 'subscription'])
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
    timeout_seconds: 1800,
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
    billing_type: 'subscription',
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
})
export type AgentExecuteResult = z.infer<typeof AgentExecuteResult>
