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

// Future exports (Phase 4):
// export * from './shepherd';
// export * from './genesis';
// export * from './armory';
