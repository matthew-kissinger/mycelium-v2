import { z } from 'zod'

// Task status enum
export const TaskStatus = z.enum(['pending', 'running', 'done', 'failed', 'cancelled'])
export type TaskStatus = z.infer<typeof TaskStatus>

// Agent types we support
export const AgentType = z.enum([
  // Original agents
  'claude', 'codex', 'gemini', 'cline', 'cursor',
  // New agents (Feb 2026)
  'kiro', 'vibe', 'pi', 'opencode', 'copilot'
])
export type AgentType = z.infer<typeof AgentType>

// Provider types - backends that can power agents
export const ProviderType = z.enum([
  // Multi-model providers (API-based)
  'openrouter',     // 100+ models: Claude, GPT, Gemini, Llama, Qwen, DeepSeek, Mistral, Kimi
  'groq',           // Ultra-fast: kimi-k2, llama-4, qwen3, gpt-oss (free tier)
  'cerebras',       // Ultra-fast: llama-3.3-70b, qwen-3-235b, glm-4.7 (free tier)
  'mistral',        // Mistral models direct: devstral, codestral, magistral
  'google',         // Gemini models direct
  'anthropic',      // Claude models direct
  'openai',         // GPT models direct
  // Agent-specific providers
  'cline',          // Cline account billing
  'opencode-zen',   // OpenCode free models (kimi-k2.5-free, glm-4.7-free, gpt-5-nano)
  'github',         // GitHub Copilot subscription
  'aws',            // AWS/Kiro (IAM Identity Center)
  'cursor',         // Cursor subscription
])
export type ProviderType = z.infer<typeof ProviderType>

// Agent-provider compatibility map
// Defines which providers each agent supports and its default
export const AGENT_PROVIDERS: Record<AgentType, { supported: ProviderType[], default: ProviderType }> = {
  // Original agents (single provider each)
  claude: { supported: ['anthropic'], default: 'anthropic' },
  codex: { supported: ['openai'], default: 'openai' },
  gemini: { supported: ['google'], default: 'google' },
  cursor: { supported: ['cursor'], default: 'cursor' },
  // Cline - multiple providers
  cline: { supported: ['openrouter', 'cline'], default: 'openrouter' },
  // New agents
  kiro: { supported: ['aws'], default: 'aws' },
  vibe: { supported: ['mistral'], default: 'mistral' },
  pi: { supported: ['openrouter', 'groq', 'cerebras', 'mistral', 'google', 'anthropic', 'openai'], default: 'openrouter' },
  opencode: { supported: ['opencode-zen', 'anthropic', 'openai', 'groq'], default: 'opencode-zen' },
  copilot: { supported: ['github'], default: 'github' },
}

// Parsed result from agent execution
export const ParsedResult = z.object({
  summary: z.string().optional(),
  files_modified: z.array(z.string()).default([]),
  files_created: z.array(z.string()).default([]),
  tests_passed: z.boolean().optional(),
  commit_hash: z.string().optional(),
})
export type ParsedResult = z.infer<typeof ParsedResult>

// Error details
export const ErrorDetails = z.object({
  error_type: z.string(),
  stderr: z.string().optional(),
  exit_code: z.number().optional(),
})
export type ErrorDetails = z.infer<typeof ErrorDetails>

// Core task schema
export const Task = z.object({
  id: z.string().uuid(),
  title: z.string(),
  status: TaskStatus,
  agent: AgentType.optional(),
  model: z.string().optional(),
  provider: ProviderType.optional(), // For agents with multiple auth (cline: openrouter vs cline account)
  repo_path: z.string(),
  prompt: z.string().optional(),

  // Dependency management
  depends_on: z.array(z.string().uuid()).default([]),
  sequenced: z.boolean().default(true),

  // Execution results
  result: z.string().optional(),
  parsed_result: ParsedResult.optional(),
  error: z.string().optional(),
  error_details: ErrorDetails.optional(),

  // Execution config
  timeout_seconds: z.number().optional(),

  // Metrics
  cost_usd: z.number().default(0),
  duration_seconds: z.number().optional(),

  // Timestamps
  created_at: z.string().datetime(),
  started_at: z.string().datetime().optional(),
  completed_at: z.string().datetime().optional(),

  // Evaluation tracking
  shepherd_evaluated_at: z.string().datetime().optional(),
  armory_reviewed_at: z.string().datetime().optional(),
})
export type Task = z.infer<typeof Task>

// Task creation input
export const TaskCreate = z.object({
  title: z.string().min(1),
  repo_path: z.string().min(1),
  prompt: z.string().optional(),
  agent: AgentType.optional(),
  model: z.string().optional(),
  provider: ProviderType.optional(), // For cline: 'openrouter' or 'cline'
  depends_on: z.array(z.string()).default([]),
  timeout_seconds: z.number().optional(),
})
export type TaskCreate = z.infer<typeof TaskCreate>

// Task update input
export const TaskUpdate = z.object({
  status: TaskStatus.optional(),
  agent: AgentType.optional(),
  model: z.string().optional(),
  provider: ProviderType.optional(),
  result: z.string().optional(),
  error: z.string().optional(),
  depends_on: z.array(z.string()).optional(),
  sequenced: z.boolean().optional(),
})
export type TaskUpdate = z.infer<typeof TaskUpdate>
