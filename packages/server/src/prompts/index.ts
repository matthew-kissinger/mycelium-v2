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

export * from './sequencer';
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

// Context injection utilities
export * from './context';
