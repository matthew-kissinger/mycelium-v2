/**
 * Agent Prompts - System prompts ported from v1
 *
 * Each prompt module contains:
 * - System prompt constant (EXACT text from v1)
 * - Output schema documentation
 * - Context building function
 * - Response parser function
 * - Default configuration
 */

export * from './discovery';

// Re-export shepherd with renamed buildContinuationPrompt
export {
  SHEPHERD_SYSTEM_PROMPT,
  SHEPHERD_OUTPUT_SCHEMA,
  SHEPHERD_CONTINUATION_PROMPT,
  type ShepherdTaskContext,
  type ShepherdSignalContext,
  type ShepherdMemoryContext,
  buildShepherdContext,
  buildShepherdPrompt,
  buildContinuationPrompt as buildShepherdContinuationPrompt,
} from './shepherd';

// Re-export genesis with renamed buildContinuationPrompt
export {
  GENESIS_AGENT_PROMPT,
  AUTO_GENESIS_PROMPT,
  GENESIS_CONTINUATION_PROMPT,
  GENESIS_MARKERS,
  type GenesisContext,
  type AutoGenesisContext,
  type ContinuationContext as GenesisContinuationContext,
  buildGenesisPrompt,
  buildAutoGenesisPrompt,
  buildContinuationPrompt as buildGenesisContinuationPrompt,
  parseGenesisResult,
  isGenesisSignal,
} from './genesis';

export * from './armory';

// Digest agent (Haiku smart agent)
export {
  DIGEST_AGENT_PROMPT,
  DIGEST_COMPLETE_MARKER,
  type DigestContext,
  type DigestOutput,
  buildDigestPrompt,
  parseDigestOutput,
} from './digest';

// Compaction agent (Haiku smart agent)
export {
  COMPACTION_AGENT_PROMPT,
  COMPACTION_COMPLETE_MARKER,
  type CompactionContext,
  type CompactionOutput,
  buildCompactionPrompt,
  parseCompactionOutput,
} from './compaction';

// Context injection utilities
export * from './context';
