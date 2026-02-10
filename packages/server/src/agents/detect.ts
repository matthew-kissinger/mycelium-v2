/**
 * CLI Agent Detection
 *
 * Probes each known agent CLI to determine availability and version.
 * Optionally fetches model lists from agents that support it.
 * Updates the agents table and invalidates registry cache after detection.
 *
 * Usage:
 *   const result = await detectAgent('claude', 'claude')
 *   const all = await detectAllAgents()
 *   const models = await fetchAgentModels('cursor')
 */

// =============================================================================
// Types
// =============================================================================

export interface DetectionResult {
  detected: boolean
  command: string
  version: string | null
  error?: string
}

// =============================================================================
// Constants
// =============================================================================

/** Hardcoded agent-to-CLI-command mapping, used when registry cache is unavailable. */
const DEFAULT_AGENT_COMMANDS: Record<string, string> = {
  claude: 'claude',
  codex: 'codex',
  gemini: 'gemini',
  cline: 'cline',
  cursor: 'agent',       // Cursor's CLI is called 'agent'
  kiro: 'kiro-cli',
  vibe: 'vibe',
  pi: 'pi',
  opencode: 'opencode',
  copilot: 'copilot',
}

/** Commands that return a model list for specific agents. */
const MODEL_LIST_COMMANDS: Record<string, string[]> = {
  cursor: ['agent', 'models'],
  pi: ['pi', '--list-models'],
  opencode: ['opencode', 'models'],
  copilot: ['copilot', '--help'],
}

/** Timeout for `which` and `--version` calls (ms). */
const DETECT_TIMEOUT_MS = 5_000

/** Timeout for model list commands (ms). */
const MODEL_FETCH_TIMEOUT_MS = 10_000

// =============================================================================
// Subprocess Helpers
// =============================================================================

/**
 * Run a command with a timeout using Bun.spawn.
 * Returns stdout and exit code on success, null on failure or timeout.
 */
async function runWithTimeout(
  args: string[],
  timeoutMs: number,
): Promise<{ stdout: string; exitCode: number } | null> {
  try {
    const proc = Bun.spawn(args, {
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'ignore',
    })

    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => {
        try {
          proc.kill('SIGKILL')
        } catch {
          // Process may already be dead
        }
        resolve(null)
      }, timeoutMs)
    })

    const resultPromise = (async () => {
      const stdout = await new Response(proc.stdout).text()
      const exitCode = await proc.exited
      return { stdout, exitCode }
    })()

    return await Promise.race([resultPromise, timeoutPromise])
  } catch {
    return null
  }
}

/**
 * Parse a version string from `--version` output.
 * Handles common formats:
 *   "claude 2.1.34"
 *   "v0.98.0"
 *   "codex version 0.98.0"
 *   "1.0.1"
 *   Multi-line output (takes the first version-like match)
 */
function parseVersion(output: string): string | null {
  if (!output || output.trim().length === 0) return null
  const match = output.match(/v?(\d+\.\d+(?:\.\d+)?(?:-[\w.]+)?)/)
  return match?.[1] ?? null
}

// =============================================================================
// Core Detection
// =============================================================================

/**
 * Detect a single CLI agent by running `which <command>` and
 * `<command> --version` with a 5-second timeout.
 */
export async function detectAgent(
  agentId: string,
  command: string,
): Promise<DetectionResult> {
  try {
    // Step 1: Check if the command exists in PATH
    const whichResult = await runWithTimeout(['which', command], DETECT_TIMEOUT_MS)
    if (!whichResult || whichResult.exitCode !== 0) {
      return {
        detected: false,
        command,
        version: null,
        error: `CLI '${command}' not found in PATH`,
      }
    }

    // Step 2: Get version via `<command> --version`
    const versionResult = await runWithTimeout([command, '--version'], DETECT_TIMEOUT_MS)

    if (!versionResult) {
      // The command exists but --version timed out or crashed.
      // Vibe has known Python 3.13 issues - still consider it detected but degraded
      // (caller handles status mapping).
      return {
        detected: true,
        command,
        version: null,
        error: `'${command} --version' timed out or failed`,
      }
    }

    const version = parseVersion(versionResult.stdout)

    // Non-zero exit from --version is unusual but the CLI still exists
    if (versionResult.exitCode !== 0 && !version) {
      return {
        detected: true,
        command,
        version: null,
        error: `'${command} --version' exited with code ${versionResult.exitCode}`,
      }
    }

    return {
      detected: true,
      command,
      version,
    }
  } catch (err) {
    return {
      detected: false,
      command,
      version: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// =============================================================================
// Bulk Detection
// =============================================================================

/**
 * Detect all known CLI agents.
 *
 * Reads the agent list from the registry cache if available, otherwise falls
 * back to the hardcoded DEFAULT_AGENT_COMMANDS map.
 *
 * After detection, updates the DB via upsertAgent and invalidates the
 * registry cache. DB modules are dynamically imported to avoid circular deps.
 */
export async function detectAllAgents(): Promise<Record<string, DetectionResult>> {
  console.log('[Detect] Starting CLI agent detection...')
  const startTime = Date.now()

  // Build the agent -> command map. Prefer registry cache if available.
  let agentCommands: Record<string, string> = { ...DEFAULT_AGENT_COMMANDS }

  try {
    const { getCachedAllAgents } = await import('./registry-cache')
    const cached = getCachedAllAgents()
    if (cached && cached.length > 0) {
      // Overlay cached commands onto defaults (cache may have additional agents
      // or updated command names).
      for (const row of cached) {
        if (row.command) {
          agentCommands[row.id] = row.command
        }
      }
      console.log(`[Detect] Using registry cache (${cached.length} agents)`)
    }
  } catch {
    console.log('[Detect] Registry cache unavailable, using hardcoded list')
  }

  const results: Record<string, DetectionResult> = {}
  let detectedCount = 0
  let unavailableCount = 0

  for (const [agentId, command] of Object.entries(agentCommands)) {
    try {
      console.log(`[Detect] Probing ${agentId} (${command})...`)
      const result = await detectAgent(agentId, command)
      results[agentId] = result

      // Determine DB status. Vibe gets 'degraded' instead of 'unavailable'
      // when detection fails due to known Python 3.13 compatibility issues.
      let status: string
      if (result.detected) {
        if (result.error) {
          status = 'degraded'
        } else {
          status = 'available'
        }
        detectedCount++
      } else {
        // Vibe special case: mark as degraded, not unavailable
        if (agentId === 'vibe') {
          status = 'degraded'
          console.log(`[Detect] ${agentId}: degraded (possible Python 3.13 compatibility issue)`)
        } else {
          status = 'unavailable'
          unavailableCount++
        }
      }

      const now = new Date().toISOString()

      // Log the result
      if (result.detected) {
        const versionStr = result.version ? ` v${result.version}` : ''
        const statusStr = status === 'degraded' ? ' [degraded]' : ''
        console.log(`[Detect] ${agentId}: ${status}${versionStr}${statusStr}`)
      } else if (agentId !== 'vibe') {
        console.log(`[Detect] ${agentId}: unavailable (${result.error ?? 'not found'})`)
      }

      // Update the DB (dynamic import to avoid circular deps)
      try {
        const { upsertAgent } = await import('../db/registry-queries')
        upsertAgent(agentId, {
          status,
          cli_version: result.version,
          cli_detected_at: now,
        })
      } catch (dbErr) {
        console.error(`[Detect] Failed to update DB for ${agentId}:`, dbErr)
      }

      // Invalidate registry cache entry
      try {
        const { invalidateAgent } = await import('./registry-cache')
        await invalidateAgent(agentId)
      } catch {
        // Cache not initialized yet - safe to ignore
      }
    } catch (err) {
      // One agent failing should not break the rest
      console.error(`[Detect] Error detecting ${agentId}:`, err)
      results[agentId] = {
        detected: false,
        command,
        version: null,
        error: err instanceof Error ? err.message : String(err),
      }
      unavailableCount++
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(
    `[Detect] Complete: ${detectedCount} available, ${unavailableCount} unavailable (${elapsed}s)`,
  )

  return results
}

// =============================================================================
// Model List Fetching
// =============================================================================

/**
 * Fetch the model list from an agent CLI that supports it.
 *
 * Known commands:
 *   cursor  -> `agent models`
 *   pi      -> `pi --list-models`
 *   opencode -> `opencode models`
 *   copilot -> `copilot --help` (models extracted from help text)
 *
 * Returns an array of parsed model IDs. Uses a 10-second timeout.
 * Returns an empty array if the agent has no model list command or parsing fails.
 */
export async function fetchAgentModels(agentId: string): Promise<string[]> {
  const args = MODEL_LIST_COMMANDS[agentId]
  if (!args) {
    console.log(`[Detect] No model list command known for agent '${agentId}'`)
    return []
  }

  console.log(`[Detect] Fetching models for ${agentId}: ${args.join(' ')}`)

  try {
    const result = await runWithTimeout(args, MODEL_FETCH_TIMEOUT_MS)
    if (!result) {
      console.log(`[Detect] Model fetch for ${agentId} timed out or failed`)
      return []
    }

    if (result.exitCode !== 0) {
      console.log(
        `[Detect] Model fetch for ${agentId} exited with code ${result.exitCode}`,
      )
      // Still try to parse output - some CLIs exit non-zero but produce output
    }

    const output = result.stdout.trim()
    if (!output) {
      return []
    }

    // Agent-specific parsing
    switch (agentId) {
      case 'cursor':
        return parseCursorModels(output)
      case 'pi':
        return parsePiModels(output)
      case 'opencode':
        return parseOpenCodeModels(output)
      case 'copilot':
        return parseCopilotModels(output)
      default:
        return parseGenericModelList(output)
    }
  } catch (err) {
    console.error(`[Detect] Error fetching models for ${agentId}:`, err)
    return []
  }
}

/**
 * Parse `agent models` output (Cursor).
 * Expects one model per line, possibly with extra whitespace or formatting.
 */
function parseCursorModels(output: string): string[] {
  return parseGenericModelList(output)
}

/**
 * Parse `pi --list-models` output.
 * Pi outputs a table with columns. Model IDs are typically in the first column.
 * Lines that look like table separators (dashes, pipes as delimiters) are skipped.
 */
function parsePiModels(output: string): string[] {
  const lines = output.split('\n')
  const models: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Skip table headers and separators
    if (/^[-+=|]+$/.test(trimmed)) continue
    if (/^\s*#/.test(trimmed)) continue
    if (/^(Name|Model|ID)\b/i.test(trimmed)) continue

    // If the line contains pipe-delimited columns, take the first column
    if (trimmed.includes('|')) {
      const cols = trimmed.split('|').map((c) => c.trim()).filter(Boolean)
      if (cols.length > 0 && cols[0] && !cols[0].startsWith('-')) {
        models.push(cols[0])
      }
    } else {
      // Single-column output - take the whole line as a model ID
      const candidate = trimmed.split(/\s+/)[0]
      if (candidate && candidate.length > 1 && !candidate.startsWith('-')) {
        models.push(candidate)
      }
    }
  }

  return models
}

/**
 * Parse `opencode models` output.
 * Expects a list, one model per line or space-separated.
 */
function parseOpenCodeModels(output: string): string[] {
  return parseGenericModelList(output)
}

/**
 * Parse `copilot --help` output.
 * Models are embedded in help text - look for model name patterns.
 * Common patterns: gpt-4, gpt-4o, gpt-3.5-turbo, claude-*, o1-*, etc.
 */
function parseCopilotModels(output: string): string[] {
  const models: string[] = []
  const seen = new Set<string>()

  // Match model-like identifiers in the help text
  const modelPattern = /\b(gpt-[\w.-]+|claude-[\w.-]+|o[134]-[\w.-]+|gemini-[\w.-]+|codex-[\w.-]+)\b/gi
  let match: RegExpExecArray | null
  while ((match = modelPattern.exec(output)) !== null) {
    const model = match[1]!.toLowerCase()
    if (!seen.has(model)) {
      seen.add(model)
      models.push(model)
    }
  }

  return models
}

/**
 * Generic model list parser. Splits on newlines, filters blanks,
 * strips leading bullet characters, and returns non-empty strings.
 */
function parseGenericModelList(output: string): string[] {
  const lines = output.split('\n')
  const models: string[] = []

  for (const line of lines) {
    let trimmed = line.trim()
    if (!trimmed) continue

    // Skip lines that look like headers or separators
    if (/^[-=]+$/.test(trimmed)) continue
    if (/^\s*#/.test(trimmed)) continue

    // Strip leading bullet characters (* - >)
    trimmed = trimmed.replace(/^[*\->]\s+/, '')

    // Strip leading numbers (1. 2. etc.)
    trimmed = trimmed.replace(/^\d+\.\s+/, '')

    // Take the first whitespace-delimited token as the model ID
    const token = trimmed.split(/\s+/)[0]
    if (token && token.length > 1) {
      models.push(token)
    }
  }

  return models
}
