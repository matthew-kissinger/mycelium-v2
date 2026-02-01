/**
 * Sequencer Agent Prompt - ported from v1 sequencer.py
 * DO NOT MODIFY - keep exact wording from v1
 *
 * The Sequencer Agent analyzes pending tasks and determines optimal execution
 * order by setting dependencies between them.
 */

/**
 * System prompt for the Sequencer agent.
 * Template variable: {MYCEL_CONTEXT} - injected at runtime with CLI context
 */
export const SEQUENCER_SYSTEM_PROMPT = `You are the Sequencer Agent for Mycelium, an agent orchestration system.

Your job is to analyze pending tasks and determine the optimal execution order by setting dependencies between them.

## Context

You will receive:
1. **Pending tasks** with their IDs, titles, prompt summaries, and files likely affected
2. **Running tasks** (avoid conflicts with these)
3. **Memory context** (patterns, warnings from past work)
4. **Recent Shepherd evaluations** (what succeeded/failed recently)

## Your Analysis

Look for:
1. **Code overlap** - Tasks touching the same files should be sequenced
2. **Logical ordering** - Setup before features, features before tests, etc.
3. **Parallel opportunities** - Independent tasks that can run simultaneously
4. **Memory-informed decisions** - Use warnings about conflicts from past runs

## Output Format

Respond with a YAML code block containing your analysis:

\`\`\`yaml
sequencing_result:
  dependency_updates:
    - task_id: abc123-full-uuid
      depends_on:
        - def456-full-uuid
      reasoning: "Task abc123 adds tests for auth, def456 refactors auth - must test after refactor"
    - task_id: ghi789-full-uuid
      depends_on:
        - abc123-full-uuid
        - def456-full-uuid
      reasoning: "Task ghi789 integrates auth with UI - needs both auth changes complete first"

  parallel_groups:
    - tasks:
        - task-id-1
        - task-id-2
        - task-id-3
      reason: "Independent UI components, different files, no shared state"

  summary: "Set 3 dependencies, identified 2 parallel groups of 3 tasks each"
\`\`\`

## Guidelines

1. **Use full task IDs** - Always use the complete UUID, not truncated versions
2. **Be specific in reasoning** - Explain WHY tasks depend on each other
3. **Avoid circular dependencies** - If A depends on B, B cannot depend on A
4. **Consider running tasks** - Don't create dependencies on running tasks (they're already executing)
5. **Minimize dependencies** - Only add dependencies that are truly necessary
6. **Look for patterns in memory** - Previous Shepherd warnings about conflicts should inform sequencing

## Decision Criteria for Dependencies

**SET a dependency when:**
- Tasks modify the same files
- One task builds on work done by another
- Tests should run after the feature they test
- Integration tasks need their components complete first
- Database migrations should run before code that uses new schema

**DON'T set a dependency when:**
- Tasks work on completely different areas
- Tasks are both read-only or exploratory
- The relationship is just "nice to have" ordering

## Empty Results

If all tasks are independent (no dependencies needed), output:

\`\`\`yaml
sequencing_result:
  dependency_updates: []
  parallel_groups:
    - tasks: [all task ids]
      reason: "All tasks are independent, can run in parallel"
  summary: "No dependencies needed - all 5 tasks can run in parallel"
\`\`\`

{MYCEL_CONTEXT}

Analyze the tasks and output your sequencing result as YAML.
`;

/**
 * YAML output schema for Sequencer agent response.
 * This documents the expected structure of the agent's YAML output.
 */
export const SEQUENCER_OUTPUT_SCHEMA = `
sequencing_result:
  dependency_updates:
    - task_id: string        # Full UUID of the task
      depends_on: string[]   # List of full UUIDs this task depends on
      reasoning: string      # Explanation of why this dependency exists

  parallel_groups:
    - tasks: string[]        # List of task IDs that can run in parallel
      reason: string         # Why these tasks are independent

  summary: string            # Brief summary of sequencing decisions
`;

/**
 * Task context for sequencer analysis
 */
export interface SequencerTaskContext {
  id: string;
  title: string;
  prompt?: string;
  repo_path: string;
  depends_on: string[];
  spec_context?: {
    files_affected?: string[];
  };
}

/**
 * Running task info (simplified)
 */
export interface RunningTaskContext {
  id: string;
  title: string;
  repo_path: string;
}

/**
 * Shepherd evaluation context
 */
export interface ShepherdEvalContext {
  repo_name: string;
  health: string;
  headline?: string;
  concerns?: string[];
  global_warnings?: string[];
}

/**
 * Memory context for a repo
 */
export interface RepoMemoryContext {
  repo_name: string;
  warnings: Array<{
    severity: string;
    content: string;
  }>;
  patterns: Array<{
    type: string;
    content: string;
  }>;
}

/**
 * Full context for Sequencer prompt building
 */
export interface SequencerContext {
  pendingTasks: SequencerTaskContext[];
  runningTasks?: RunningTaskContext[];
  repoPath?: string;
  shepherdEvals?: ShepherdEvalContext[];
  globalMemory?: string;
  repoMemories?: RepoMemoryContext[];
  mycelContext?: string;
}

/**
 * Build the full prompt for Sequencer agent.
 *
 * @param context - Context with tasks, memory, and evaluations
 * @returns Complete prompt string ready for agent execution
 */
export function buildSequencerPrompt(context: SequencerContext): string {
  const parts: string[] = [];

  // Header
  if (context.repoPath) {
    const repoName = context.repoPath.split('/').pop() || context.repoPath;
    parts.push(`## Sequencing Tasks for: ${repoName}`);
    parts.push(`Path: ${context.repoPath}`);
  } else {
    parts.push('## Sequencing All Pending Tasks');
  }
  parts.push('');

  // Global memory context
  if (context.globalMemory) {
    parts.push(context.globalMemory);
    parts.push('');
  }

  // Repo memories
  if (context.repoPath && context.repoMemories) {
    const repoMemory = context.repoMemories.find(
      (m) => m.repo_name === context.repoPath?.split('/').pop()
    );
    if (repoMemory && (repoMemory.patterns.length > 0 || repoMemory.warnings.length > 0)) {
      parts.push(`### Memory for ${repoMemory.repo_name}`);
      if (repoMemory.warnings.length > 0) {
        parts.push('**Warnings:**');
        for (const w of repoMemory.warnings.slice(-5)) {
          parts.push(`- [${w.severity}] ${w.content}`);
        }
      }
      parts.push('');
    }
  } else if (context.repoMemories && context.repoMemories.length > 0) {
    // Include all repo memories when not focused on a specific repo
    for (const repoMemory of context.repoMemories) {
      if (repoMemory.patterns.length > 0 || repoMemory.warnings.length > 0) {
        parts.push(`### Memory for ${repoMemory.repo_name}`);
        if (repoMemory.warnings.length > 0) {
          parts.push('**Warnings:**');
          for (const w of repoMemory.warnings.slice(-3)) {
            parts.push(`- [${w.severity}] ${w.content}`);
          }
        }
        parts.push('');
      }
    }
  }

  // Running tasks (to avoid conflicts)
  if (context.runningTasks && context.runningTasks.length > 0) {
    parts.push('## Currently Running Tasks (DO NOT DEPEND ON)');
    parts.push("These tasks are already executing. Don't create dependencies on them.");
    parts.push('');
    for (const task of context.runningTasks) {
      parts.push(`- **${task.id}**: ${task.title}`);
      if (task.repo_path) {
        const repoName = task.repo_path.split('/').pop() || task.repo_path;
        parts.push(`  Repo: ${repoName}`);
      }
    }
    parts.push('');
  }

  // Pending tasks to analyze
  parts.push('## Pending Tasks to Sequence');
  parts.push('');

  for (let i = 0; i < context.pendingTasks.length; i++) {
    const task = context.pendingTasks[i];
    const taskNum = i + 1;
    const filesAffected = task.spec_context?.files_affected || [];

    parts.push(`### Task ${taskNum}: ${task.title}`);
    parts.push(`- **ID**: \`${task.id}\``);

    if (task.repo_path) {
      const repoName = task.repo_path.split('/').pop() || task.repo_path;
      parts.push(`- **Repo**: ${repoName}`);
    }

    if (task.depends_on && task.depends_on.length > 0) {
      parts.push(`- **Existing dependencies**: ${JSON.stringify(task.depends_on)}`);
    }

    if (filesAffected.length > 0) {
      parts.push(`- **Files likely affected**: ${filesAffected.slice(0, 10).join(', ')}`);
    }

    // Truncate prompt for context
    const prompt = task.prompt || '';
    const promptSummary = prompt.length > 500 ? prompt.slice(0, 500) + '...' : prompt;
    parts.push(`- **Prompt summary**:\n  \`\`\`\n  ${promptSummary}\n  \`\`\``);
    parts.push('');
  }

  // Recent Shepherd evaluations
  if (context.shepherdEvals && context.shepherdEvals.length > 0) {
    parts.push('## Recent Shepherd Evaluations');
    parts.push('Learn from recent successes and failures:');
    parts.push('');

    for (const ev of context.shepherdEvals.slice(0, 3)) {
      parts.push(`### ${ev.repo_name} - ${ev.health}`);
      if (ev.headline) {
        parts.push(`- ${ev.headline}`);
      }
      if (ev.concerns && ev.concerns.length > 0) {
        parts.push('- **Concerns**: ' + ev.concerns.slice(0, 3).join('; '));
      }
      if (ev.global_warnings && ev.global_warnings.length > 0) {
        parts.push('- **Warnings**: ' + ev.global_warnings.slice(0, 3).join('; '));
      }
      parts.push('');
    }
  }

  parts.push('---');
  parts.push('');
  parts.push('Analyze task relationships and output your sequencing result as YAML.');

  // Build final prompt
  const contextSection = parts.join('\n');

  // Inject mycel context into system prompt
  const mycelContext = context.mycelContext || '';
  const systemPrompt = SEQUENCER_SYSTEM_PROMPT.replace('{MYCEL_CONTEXT}', mycelContext);

  return `${systemPrompt}\n\n---\n\n${contextSection}`;
}

/**
 * Parsed dependency update from Sequencer output
 */
export interface DependencyUpdate {
  taskId: string;
  dependsOn: string[];
  reasoning: string;
}

/**
 * Parsed parallel group from Sequencer output
 */
export interface ParallelGroup {
  tasks: string[];
  reason: string;
}

/**
 * Parsed Sequencer output
 */
export interface SequencerOutput {
  dependencyUpdates: DependencyUpdate[];
  parallelGroups: ParallelGroup[];
  summary: string;
}

/**
 * Raw YAML dependency update structure
 */
interface RawDependencyUpdate {
  task_id?: string;
  depends_on?: string[];
  reasoning?: string;
}

/**
 * Raw YAML parallel group structure
 */
interface RawParallelGroup {
  tasks?: string[];
  reason?: string;
}

/**
 * Raw YAML sequencing result structure
 */
interface RawSequencingResult {
  dependency_updates?: RawDependencyUpdate[];
  parallel_groups?: RawParallelGroup[];
  summary?: string;
}

/**
 * Raw parsed YAML structure from Sequencer response
 */
interface RawSequencerYaml {
  sequencing_result?: RawSequencingResult;
}

/**
 * Parse Sequencer agent YAML response.
 *
 * @param response - Raw response from Sequencer agent
 * @returns Parsed SequencerOutput structure
 */
export function parseSequencerResponse(response: string): SequencerOutput {
  const result: SequencerOutput = {
    dependencyUpdates: [],
    parallelGroups: [],
    summary: 'No analysis produced',
  };

  if (!response || response.trim() === '') {
    return result;
  }

  // Extract YAML from response
  const yamlMatch = response.match(/```yaml\s*([\s\S]*?)```/);
  if (!yamlMatch) {
    console.log('[SEQUENCER] No YAML block found in response');
    return result;
  }

  const yamlStr = yamlMatch[1].trim();

  try {
    // Parse YAML (we'll need a YAML parser - for now use basic parsing)
    // Note: In production, use a proper YAML parser like js-yaml
    const data = parseBasicYaml(yamlStr);

    if (data && data.sequencing_result) {
      const seqResult = data.sequencing_result;

      // Parse dependency updates
      if (Array.isArray(seqResult.dependency_updates)) {
        for (const update of seqResult.dependency_updates) {
          const taskId = update.task_id ?? '';
          const deps = Array.isArray(update.depends_on) ? update.depends_on : [];
          const reasoning = update.reasoning ?? '';

          if (taskId && deps.length > 0) {
            result.dependencyUpdates.push({
              taskId,
              dependsOn: deps,
              reasoning,
            });
          }
        }
      }

      // Parse parallel groups
      if (Array.isArray(seqResult.parallel_groups)) {
        for (const group of seqResult.parallel_groups) {
          const tasks = Array.isArray(group.tasks) ? group.tasks : [];
          const reason = group.reason ?? '';

          if (tasks.length > 0) {
            result.parallelGroups.push({
              tasks,
              reason,
            });
          }
        }
      }

      result.summary = seqResult.summary ?? 'Analysis complete';
    }
  } catch (error) {
    console.log('[SEQUENCER] YAML parse error:', error);
  }

  return result;
}

/**
 * Basic YAML parser for Sequencer output.
 * Note: This is a simplified parser. In production, use js-yaml.
 *
 * @param yamlStr - YAML string to parse
 * @returns Parsed object or null
 */
function parseBasicYaml(_yamlStr: string): RawSequencerYaml | null {
  // This is a placeholder - in production, use a proper YAML parser
  // For now, we'll rely on the agent harness or external parsing
  // The actual YAML parsing will be done by the dispatch module
  // which will use a proper YAML library (js-yaml or yaml)
  //
  // To use this in production:
  // import YAML from 'yaml';
  // return YAML.parse(yamlStr) as RawSequencerYaml;
  return null;
}

/**
 * Default configuration for Sequencer agent
 */
export const SEQUENCER_CONFIG = {
  agent: 'claude',
  model: 'sonnet', // Sonnet for balance of speed and quality
  maxTurns: 10,
  timeout: 300000, // 5 minutes
} as const;
