import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db, schema } from '../db'
import { broadcast } from '../sse'
import * as queries from '../db/queries'
import { dispatch } from '../agents'

const app = new Hono()

// =============================================================================
// Orchestration Request Schema
// =============================================================================
const OrchestrateRequest = z.object({
  // What the user wants to accomplish
  goal: z.string().min(1).describe('High-level goal description'),
  // Target repo
  repo_path: z.string().min(1),
  // Optional context
  context: z.string().optional().describe('Additional context or constraints'),
  // Agent preference for generation (defaults to claude with opus)
  agent: z.enum(['claude', 'codex', 'gemini']).default('claude'),
  model: z.string().optional().default('opus'),
  // Whether to create the task immediately or just return the spec
  create_task: z.boolean().default(false),
})
type OrchestrateRequest = z.infer<typeof OrchestrateRequest>

// =============================================================================
// POST /api/orchestrate - Generate task spec with Opus
// Takes a high-level goal and generates a detailed task specification
// =============================================================================
app.post('/', zValidator('json', OrchestrateRequest), async (c) => {
  const data = c.req.valid('json')

  // Get repo info if available
  const repo = await queries.getRepoByPath(data.repo_path)

  // Get memory patterns for context
  const patterns = repo
    ? await queries.getPatterns({ repo_path: data.repo_path, limit: 10 })
    : []

  // Get recent tasks for this repo to avoid duplicates
  const recentTasks = repo
    ? await queries.getTasksByRepo(data.repo_path, { limit: 10 })
    : []

  // Build the orchestration prompt
  const prompt = buildOrchestrationPrompt({
    goal: data.goal,
    repo_path: data.repo_path,
    repo_description: repo?.description ?? undefined,
    repo_language: repo?.language ?? undefined,
    context: data.context,
    patterns: patterns.map((p) => p.content),
    recent_tasks: recentTasks.map((t) => ({
      title: t.title,
      status: t.status,
      prompt: t.prompt?.slice(0, 200),
    })),
  })

  // Call the orchestration agent
  const result = await dispatch({
    agent: data.agent as any,
    model: data.model,
    prompt,
    cwd: data.repo_path,
  })

  if (!result.success) {
    return c.json({
      error: 'Orchestration failed',
      details: result.output,
      exit_code: result.exit_code,
    }, 500)
  }

  // Parse the generated specification
  const spec = parseTaskSpec(result.output)

  if (!spec) {
    return c.json({
      error: 'Failed to parse task specification',
      raw_output: result.output,
    }, 500)
  }

  // Optionally create the task
  if (data.create_task) {
    const taskId = crypto.randomUUID()
    const now = new Date().toISOString()

    const task = {
      id: taskId,
      title: spec.title,
      status: 'pending',
      agent: spec.recommended_agent ?? 'claude',
      model: spec.recommended_model ?? null,
      repo_path: data.repo_path,
      prompt: spec.prompt,
      depends_on: '[]',
      sequenced: false,
      created_at: now,
    }

    await db.insert(schema.tasks).values(task)

    broadcast('task:created', {
      ...task,
      depends_on: [],
    })

    return c.json({
      message: 'Task created from orchestration',
      task: {
        ...task,
        depends_on: [],
      },
      spec,
      cost_usd: result.cost_usd,
      duration_seconds: result.duration_seconds,
    }, 201)
  }

  // Return just the spec
  return c.json({
    spec,
    raw_output: result.output,
    cost_usd: result.cost_usd,
    duration_seconds: result.duration_seconds,
  })
})

// =============================================================================
// Helper: Build orchestration prompt
// =============================================================================
function buildOrchestrationPrompt(params: {
  goal: string
  repo_path: string
  repo_description?: string
  repo_language?: string
  context?: string
  patterns: string[]
  recent_tasks: Array<{ title: string; status: string; prompt?: string }>
}): string {
  const parts: string[] = []

  parts.push(`# Task Specification Request

You are an orchestration agent. Generate a detailed task specification for the following goal.

## Goal
${params.goal}

## Target Repository
- Path: ${params.repo_path}
${params.repo_description ? `- Description: ${params.repo_description}` : ''}
${params.repo_language ? `- Language: ${params.repo_language}` : ''}
`)

  if (params.context) {
    parts.push(`## Additional Context
${params.context}
`)
  }

  if (params.patterns.length > 0) {
    parts.push(`## Known Patterns
${params.patterns.map((p) => `- ${p}`).join('\n')}
`)
  }

  if (params.recent_tasks.length > 0) {
    parts.push(`## Recent Tasks (avoid duplicates)
${params.recent_tasks.map((t) => `- [${t.status}] ${t.title}`).join('\n')}
`)
  }

  parts.push(`## Output Format
Respond with a JSON object containing:
\`\`\`json
{
  "title": "Short, actionable task title",
  "prompt": "Detailed prompt for the agent to execute this task",
  "recommended_agent": "claude|codex|gemini",
  "recommended_model": "model name or null",
  "estimated_complexity": "low|medium|high",
  "dependencies": ["list of things that should be done first"],
  "success_criteria": ["list of criteria to determine success"]
}
\`\`\`

Generate a comprehensive task specification that an AI coding agent can execute.
The prompt should be detailed enough that the agent can complete the task without additional clarification.
`)

  return parts.join('\n')
}

// =============================================================================
// Helper: Parse task specification from agent output
// =============================================================================
function parseTaskSpec(output: string): {
  title: string
  prompt: string
  recommended_agent?: string
  recommended_model?: string
  estimated_complexity?: string
  dependencies?: string[]
  success_criteria?: string[]
} | null {
  try {
    // Try to find JSON in the output
    const jsonMatch = output.match(/```json\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1])
    }

    // Try to parse the whole output as JSON
    const parsed = JSON.parse(output)
    if (parsed.title && parsed.prompt) {
      return parsed
    }

    // Try to find a JSON object anywhere in the output
    const objectMatch = output.match(/\{[\s\S]*"title"[\s\S]*"prompt"[\s\S]*\}/)
    if (objectMatch) {
      return JSON.parse(objectMatch[0])
    }

    return null
  } catch {
    return null
  }
}

export default app
