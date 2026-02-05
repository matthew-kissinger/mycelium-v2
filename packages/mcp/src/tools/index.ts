/**
 * MCP tools for mycelium.
 * Each tool maps to an API endpoint on the mycelium backend.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js'

const API_URL = process.env.MYCEL_API_URL ?? 'http://localhost:8765'

/**
 * All available MCP tools for mycelium.
 */
export const tools: Tool[] = [
  // =========================================================================
  // Stats
  // =========================================================================
  {
    name: 'mycel_stats',
    description: 'Get task statistics from mycelium including total tasks, pending, running, completed, failed counts and total cost.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },

  // =========================================================================
  // Tasks
  // =========================================================================
  {
    name: 'mycel_tasks',
    description: 'List tasks with optional filtering by status, repo path, agent, or sequenced state.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          enum: ['pending', 'running', 'completed', 'failed'],
          description: 'Filter by task status',
        },
        repo_path: {
          type: 'string',
          description: 'Filter by repository path',
        },
        agent: {
          type: 'string',
          enum: ['claude', 'codex', 'gemini', 'cline', 'cursor'],
          description: 'Filter by agent type',
        },
        sequenced: {
          type: 'boolean',
          description: 'Filter by sequenced state (true = ready to run)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of tasks to return (default 50)',
        },
      },
    },
  },
  {
    name: 'mycel_task_create',
    description: 'Create a new task for an agent to execute.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        title: {
          type: 'string',
          description: 'Task title (brief description)',
        },
        repo_path: {
          type: 'string',
          description: 'Absolute path to the repository',
        },
        agent: {
          type: 'string',
          enum: ['claude', 'codex', 'gemini', 'cline', 'cursor'],
          description: 'Agent to execute the task',
        },
        model: {
          type: 'string',
          description: 'Model to use (e.g., sonnet, opus, gpt-4)',
        },
        prompt: {
          type: 'string',
          description: 'Full task prompt/specification',
        },
        depends_on: {
          type: 'array',
          items: { type: 'string' },
          description: 'Task IDs this task depends on (blocks until completed)',
        },
      },
      required: ['title', 'repo_path'],
    },
  },
  {
    name: 'mycel_task_run',
    description: 'Run a pending task. Task must be sequenced and have no unresolved dependencies.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        task_id: {
          type: 'string',
          description: 'Task ID (UUID or short prefix)',
        },
        agent: {
          type: 'string',
          enum: ['claude', 'codex', 'gemini', 'cline', 'cursor'],
          description: 'Override agent for this run',
        },
        model: {
          type: 'string',
          description: 'Override model for this run',
        },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'mycel_task_info',
    description: 'Get detailed information about a specific task including status, result, dependencies, and context.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        task_id: {
          type: 'string',
          description: 'Task ID (UUID or short prefix)',
        },
      },
      required: ['task_id'],
    },
  },

  // =========================================================================
  // Repos
  // =========================================================================
  {
    name: 'mycel_repos',
    description: 'List all repositories in the mycelium network with their mode, language, and description.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'mycel_repos_health',
    description: 'Get health status of all repositories including task counts and health scores.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },

  // =========================================================================
  // Notifications
  // =========================================================================
  {
    name: 'mycel_notify',
    description: 'Send a notification message via Telegram.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        message: {
          type: 'string',
          description: 'Message to send',
        },
      },
      required: ['message'],
    },
  },

  // =========================================================================
  // Alignment
  // =========================================================================
  {
    name: 'mycel_align',
    description: 'Create an alignment signal to request human input. Can optionally wait for response.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        question: {
          type: 'string',
          description: 'Question to ask the human',
        },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of choices (e.g., ["Yes", "No", "Skip"])',
        },
        task_id: {
          type: 'string',
          description: 'Associated task ID',
        },
        repo_path: {
          type: 'string',
          description: 'Associated repository path',
        },
        wait: {
          type: 'boolean',
          description: 'Wait for response (blocking). Default false.',
        },
        timeout_seconds: {
          type: 'number',
          description: 'Timeout in seconds when waiting (default 300)',
        },
      },
      required: ['question'],
    },
  },

  // =========================================================================
  // Memory
  // =========================================================================
  {
    name: 'mycel_memory',
    description: 'Get memory patterns and warnings for a repository or globally.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        repo_path: {
          type: 'string',
          description: 'Repository path. If omitted, returns global memory.',
        },
      },
    },
  },
  {
    name: 'mycel_memory_add',
    description: 'Add a new pattern or warning to memory.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          enum: ['pattern', 'warning'],
          description: 'Type of memory entry',
        },
        content: {
          type: 'string',
          description: 'Content of the pattern or warning',
        },
        repo_path: {
          type: 'string',
          description: 'Repository path. If omitted, adds to global memory.',
        },
        severity: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Severity level (for warnings only)',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags (for patterns only)',
        },
      },
      required: ['type', 'content'],
    },
  },

  // =========================================================================
  // Genesis
  // =========================================================================
  {
    name: 'mycel_genesis',
    description: 'Create a new repository with agent plumbing (CLAUDE.md, README, git initialized).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        description: {
          type: 'string',
          description: 'Description of the repo to create',
        },
        language: {
          type: 'string',
          description: 'Primary language hint (e.g., typescript, python, rust)',
        },
        private: {
          type: 'boolean',
          description: 'Create as private repo (default false)',
        },
      },
      required: ['description'],
    },
  },

  // =========================================================================
  // Signals
  // =========================================================================
  {
    name: 'mycel_signals',
    description: 'List alignment signals with optional filtering.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          enum: ['pending', 'responded', 'expired'],
          description: 'Filter by signal status',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of signals to return',
        },
      },
    },
  },
]

/**
 * Handle a tool call by making the appropriate API request.
 */
export async function handleToolCall(
  name: string,
  args: Record<string, unknown>
): Promise<{ content: { type: 'text'; text: string }[] }> {
  try {
    let result: unknown

    switch (name) {
      // =====================================================================
      // Stats
      // =====================================================================
      case 'mycel_stats': {
        result = await fetch(`${API_URL}/api/stats`).then((r) => r.json())
        break
      }

      // =====================================================================
      // Tasks
      // =====================================================================
      case 'mycel_tasks': {
        const params = new URLSearchParams()
        if (args.status) params.set('status', String(args.status))
        if (args.repo_path) params.set('repo_path', String(args.repo_path))
        if (args.agent) params.set('agent', String(args.agent))
        if (args.sequenced !== undefined) params.set('sequenced', String(args.sequenced))
        if (args.limit) params.set('limit', String(args.limit))
        const query = params.toString()
        result = await fetch(`${API_URL}/api/tasks${query ? `?${query}` : ''}`).then((r) => r.json())
        break
      }

      case 'mycel_task_create': {
        result = await fetch(`${API_URL}/api/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: args.title,
            repo_path: args.repo_path,
            agent: args.agent,
            model: args.model,
            prompt: args.prompt,
            depends_on: args.depends_on ?? [],
          }),
        }).then((r) => r.json())
        break
      }

      case 'mycel_task_run': {
        const taskId = String(args.task_id)
        result = await fetch(`${API_URL}/api/tasks/${taskId}/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent: args.agent,
            model: args.model,
          }),
        }).then((r) => r.json())
        break
      }

      case 'mycel_task_info': {
        const taskId = String(args.task_id)
        result = await fetch(`${API_URL}/api/tasks/${taskId}`).then((r) => r.json())
        break
      }

      // =====================================================================
      // Repos
      // =====================================================================
      case 'mycel_repos': {
        result = await fetch(`${API_URL}/api/repos`).then((r) => r.json())
        break
      }

      case 'mycel_repos_health': {
        result = await fetch(`${API_URL}/api/repos/health`).then((r) => r.json())
        break
      }

      // =====================================================================
      // Notifications
      // =====================================================================
      case 'mycel_notify': {
        result = await fetch(`${API_URL}/api/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: args.message }),
        }).then((r) => r.json())
        break
      }

      // =====================================================================
      // Alignment
      // =====================================================================
      case 'mycel_align': {
        result = await fetch(`${API_URL}/api/align`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: args.question,
            options: args.options,
            task_id: args.task_id,
            repo_path: args.repo_path,
            wait: args.wait ?? false,
            timeout_seconds: args.timeout_seconds ?? 300,
          }),
        }).then((r) => r.json())
        break
      }

      // =====================================================================
      // Memory
      // =====================================================================
      case 'mycel_memory': {
        const path = args.repo_path
          ? `/api/memory/repo/${encodeURIComponent(String(args.repo_path))}`
          : '/api/memory/global'
        result = await fetch(`${API_URL}${path}`).then((r) => r.json())
        break
      }

      case 'mycel_memory_add': {
        const path = args.repo_path
          ? `/api/memory/repo/${encodeURIComponent(String(args.repo_path))}`
          : '/api/memory/global'
        result = await fetch(`${API_URL}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: args.type,
            content: args.content,
            severity: args.severity,
            tags: args.tags,
          }),
        }).then((r) => r.json())
        break
      }

      // =====================================================================
      // Genesis
      // =====================================================================
      case 'mycel_genesis': {
        result = await fetch(`${API_URL}/api/genesis/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            description: args.description,
            language: args.language,
            private: args.private ?? false,
          }),
        }).then((r) => r.json())
        break
      }

      // =====================================================================
      // Signals
      // =====================================================================
      case 'mycel_signals': {
        const params = new URLSearchParams()
        if (args.status) params.set('status', String(args.status))
        if (args.limit) params.set('limit', String(args.limit))
        const query = params.toString()
        result = await fetch(`${API_URL}/api/signals${query ? `?${query}` : ''}`).then((r) => r.json())
        break
      }

      default:
        throw new Error(`Unknown tool: ${name}`)
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
    }
  }
}
