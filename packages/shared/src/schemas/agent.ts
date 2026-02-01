import { z } from 'zod'
import { AgentType } from './task'

// Agent configuration
export const AgentConfig = z.object({
  type: AgentType,
  command: z.string(), // CLI command to run
  timeout_seconds: z.number().default(1800), // 30 min default
  max_turns: z.number().default(50),
  supports_streaming: z.boolean().default(true),
})
export type AgentConfig = z.infer<typeof AgentConfig>

// Default agent configurations
export const DEFAULT_AGENT_CONFIGS: Record<string, AgentConfig> = {
  claude: {
    type: 'claude',
    command: 'claude',
    timeout_seconds: 1800,
    max_turns: 50,
    supports_streaming: true,
  },
  codex: {
    type: 'codex',
    command: 'codex',
    timeout_seconds: 1800,
    max_turns: 50,
    supports_streaming: true,
  },
  gemini: {
    type: 'gemini',
    command: 'gemini',
    timeout_seconds: 900,
    max_turns: 30,
    supports_streaming: true,
  },
  cline: {
    type: 'cline',
    command: 'cline',
    timeout_seconds: 600,
    max_turns: 30,
    supports_streaming: false,
  },
  cursor: {
    type: 'cursor',
    command: 'cursor',
    timeout_seconds: 600,
    max_turns: 30,
    supports_streaming: false,
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
