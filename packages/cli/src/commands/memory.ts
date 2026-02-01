/**
 * Memory CLI commands.
 *
 * Provides commands for viewing and managing patterns and warnings.
 */

import { Command } from 'commander'
import { getClient, ApiError } from '../client.ts'
import { success, error, info, warn } from '../output.ts'

/**
 * Memory response from API.
 */
interface MemoryResponse {
  patterns: Pattern[]
  warnings: Warning[]
  repo_path?: string
}

interface Pattern {
  id: string
  content: string
  source: string
  tags?: string[]
  task_id?: string
  created_at: string
}

interface Warning {
  id: string
  content: string
  severity: 'low' | 'medium' | 'high'
  task_id?: string
  created_at: string
}

interface CompactResponse {
  message: string
  repo_path: string
  status: string
}

/**
 * Register memory-related commands on the program.
 */
export function registerMemoryCommands(program: Command): void {
  const memory = program
    .command('memory')
    .description('View and manage memory patterns and warnings')

  // Default action (list memory)
  memory
    .option('-r, --repo <path>', 'Repository path (omit for global memory)')
    .action(async (options: { repo?: string }) => {
      const client = getClient()

      try {
        let data: MemoryResponse
        if (options.repo) {
          const encodedPath = encodeURIComponent(options.repo)
          data = await client.get<MemoryResponse>(`/api/memory/repo/${encodedPath}`)
        } else {
          data = await client.get<MemoryResponse>('/api/memory/global')
        }

        // Display repo context if specified
        if (options.repo) {
          console.log(`\nRepository: ${options.repo}`)
        } else {
          console.log('\nGlobal Memory')
        }

        // Display patterns
        console.log('\nPatterns:')
        if (data.patterns.length === 0) {
          info('  (none)')
        } else {
          for (const p of data.patterns) {
            console.log(`  - ${p.content}`)
            if (p.tags && p.tags.length > 0) {
              console.log(`    Tags: ${p.tags.join(', ')}`)
            }
            if (p.source && p.source !== 'manual') {
              console.log(`    Source: ${p.source}`)
            }
          }
        }

        // Display warnings
        console.log('\nWarnings:')
        if (data.warnings.length === 0) {
          info('  (none)')
        } else {
          for (const w of data.warnings) {
            const severityLabel = formatSeverity(w.severity)
            console.log(`  - [${severityLabel}] ${w.content}`)
          }
        }

        console.log('') // trailing newline
      } catch (err) {
        if (err instanceof ApiError) {
          error(`Failed to fetch memory: ${err.message}`)
          if (err.body && typeof err.body === 'object' && 'error' in err.body) {
            console.error(`  ${(err.body as { error: string }).error}`)
          }
        } else {
          throw err
        }
        process.exit(1)
      }
    })

  // Add pattern or warning
  memory
    .command('add <content>')
    .description('Add a pattern or warning to memory')
    .option('-t, --type <type>', 'Type: pattern or warning', 'pattern')
    .option('-r, --repo <path>', 'Repository path (omit for global memory)')
    .option('-s, --severity <level>', 'Warning severity: low, medium, high', 'medium')
    .option('--tags <tags...>', 'Pattern tags (space-separated)')
    .option('--task <id>', 'Associate with task ID')
    .action(async (content: string, options: {
      type: 'pattern' | 'warning'
      repo?: string
      severity?: string
      tags?: string[]
      task?: string
    }) => {
      const client = getClient()

      // Validate type
      if (options.type !== 'pattern' && options.type !== 'warning') {
        error(`Invalid type: ${options.type}. Must be 'pattern' or 'warning'.`)
        process.exit(1)
      }

      // Validate severity for warnings
      if (options.type === 'warning' && options.severity) {
        const validSeverities = ['low', 'medium', 'high']
        if (!validSeverities.includes(options.severity)) {
          error(`Invalid severity: ${options.severity}. Must be one of: ${validSeverities.join(', ')}`)
          process.exit(1)
        }
      }

      const body: Record<string, unknown> = {
        type: options.type,
        content,
      }

      if (options.type === 'pattern') {
        if (options.tags && options.tags.length > 0) {
          body.tags = options.tags
        }
      } else {
        // warning
        body.severity = options.severity ?? 'medium'
      }

      if (options.task) {
        body.task_id = options.task
      }

      try {
        if (options.repo) {
          const encodedPath = encodeURIComponent(options.repo)
          await client.post(`/api/memory/repo/${encodedPath}`, body)
        } else {
          await client.post('/api/memory/global', body)
        }

        const scope = options.repo ? `repo ${options.repo}` : 'global memory'
        success(`Added ${options.type} to ${scope}: ${truncate(content, 60)}`)
      } catch (err) {
        if (err instanceof ApiError) {
          error(`Failed to add ${options.type}: ${err.message}`)
          if (err.body && typeof err.body === 'object' && 'error' in err.body) {
            console.error(`  ${(err.body as { error: string }).error}`)
          }
        } else {
          throw err
        }
        process.exit(1)
      }
    })

  // Compact command (top-level, not subcommand of memory)
  program
    .command('compact')
    .description('Compact memory (merge duplicates, remove stale entries)')
    .option('-r, --repo <path>', 'Repository path (omit for global memory)')
    .action(async (options: { repo?: string }) => {
      const client = getClient()

      try {
        const result = await client.post<CompactResponse>('/api/memory/compact', {
          repo_path: options.repo,
        })

        const scope = options.repo ?? 'global'
        success(`Memory compaction triggered for ${scope}`)
        info(`Status: ${result.status}`)
      } catch (err) {
        if (err instanceof ApiError) {
          error(`Failed to trigger compaction: ${err.message}`)
          if (err.body && typeof err.body === 'object' && 'error' in err.body) {
            console.error(`  ${(err.body as { error: string }).error}`)
          }
        } else {
          throw err
        }
        process.exit(1)
      }
    })
}

/**
 * Format severity level for display.
 */
function formatSeverity(severity: 'low' | 'medium' | 'high'): string {
  switch (severity) {
    case 'low':
      return 'LOW'
    case 'medium':
      return 'MEDIUM'
    case 'high':
      return 'HIGH'
  }
}

/**
 * Truncate a string to a maximum length.
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str
  }
  return str.slice(0, maxLength - 3) + '...'
}
