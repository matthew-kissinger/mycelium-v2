import { describe, test, expect } from 'bun:test'
import { claudeAdapter } from '../src/agents/adapters/claude'
import { codexAdapter } from '../src/agents/adapters/codex'
import { geminiAdapter } from '../src/agents/adapters/gemini'
import { clineAdapter } from '../src/agents/adapters/cline'
import { opencodeAdapter } from '../src/agents/adapters/opencode'
import { piAdapter } from '../src/agents/adapters/pi'
import { copilotAdapter } from '../src/agents/adapters/copilot'
import { cursorAdapter } from '../src/agents/adapters/cursor'
import { kiroAdapter } from '../src/agents/adapters/kiro'
import { vibeAdapter } from '../src/agents/adapters/vibe'

// ---------------------------------------------------------------------------
// Claude - JSON envelope from --output-format json
// ---------------------------------------------------------------------------
describe('claudeAdapter.parseUsage', () => {
  test('parses full JSON envelope', () => {
    const output = JSON.stringify({
      type: 'result',
      subtype: 'success',
      cost_usd: 0.0342,
      duration_api_ms: 8200,
      num_turns: 3,
      result: 'response text',
      session_id: 'abc-123-def',
      total_cost_usd: 0.0342,
      usage: {
        input_tokens: 4500,
        output_tokens: 1200,
        cache_creation_input_tokens: 800,
        cache_read_input_tokens: 2000,
      },
    })
    const usage = claudeAdapter.parseUsage!(output)
    expect(usage).toBeDefined()
    expect(usage!.input_tokens).toBe(4500)
    expect(usage!.output_tokens).toBe(1200)
    expect(usage!.cache_read_tokens).toBe(2000)
    expect(usage!.cache_write_tokens).toBe(800)
    expect(usage!.cost_usd).toBe(0.0342)
    expect(usage!.session_id).toBe('abc-123-def')
    expect(usage!.num_turns).toBe(3)
    expect(usage!.api_duration_ms).toBe(8200)
  })

  test('returns undefined for empty string', () => {
    expect(claudeAdapter.parseUsage!('')).toBeUndefined()
  })

  test('returns undefined for invalid JSON', () => {
    expect(claudeAdapter.parseUsage!('not json at all')).toBeUndefined()
  })

  test('returns undefined when type is not result', () => {
    const output = JSON.stringify({ type: 'error', error: 'something broke' })
    expect(claudeAdapter.parseUsage!(output)).toBeUndefined()
  })

  test('returns partial usage when some fields are missing', () => {
    const output = JSON.stringify({
      type: 'result',
      cost_usd: 0.01,
      session_id: 'sess-1',
    })
    const usage = claudeAdapter.parseUsage!(output)
    expect(usage).toBeDefined()
    expect(usage!.cost_usd).toBe(0.01)
    expect(usage!.session_id).toBe('sess-1')
    expect(usage!.input_tokens).toBeUndefined()
    expect(usage!.output_tokens).toBeUndefined()
  })

  test('returns undefined when result type but no useful fields', () => {
    const output = JSON.stringify({ type: 'result', subtype: 'success' })
    expect(claudeAdapter.parseUsage!(output)).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// OpenCode - NDJSON with step_finish events
// ---------------------------------------------------------------------------
describe('opencodeAdapter.parseUsage', () => {
  test('aggregates multiple step_finish events', () => {
    const output = [
      '{"type":"step_start","sessionID":"ses_abc"}',
      '{"type":"text","sessionID":"ses_abc","part":{"type":"text","text":"hello"}}',
      '{"type":"step_finish","sessionID":"ses_abc","part":{"reason":"end_turn","cost":0.002,"tokens":{"input":3000,"output":800,"reasoning":0,"cache":{"read":1500,"write":400}}}}',
      '{"type":"step_finish","sessionID":"ses_abc","part":{"reason":"end_turn","cost":0.001,"tokens":{"input":1000,"output":400,"reasoning":200,"cache":{"read":500,"write":100}}}}',
    ].join('\n')

    const usage = opencodeAdapter.parseUsage!(output)
    expect(usage).toBeDefined()
    expect(usage!.input_tokens).toBe(4000)
    expect(usage!.output_tokens).toBe(1200)
    expect(usage!.cache_read_tokens).toBe(2000)
    expect(usage!.cache_write_tokens).toBe(500)
    expect(usage!.thinking_tokens).toBe(200)
    expect(usage!.cost_usd).toBe(0.003)
    expect(usage!.session_id).toBe('ses_abc')
  })

  test('returns undefined for empty string', () => {
    expect(opencodeAdapter.parseUsage!('')).toBeUndefined()
  })

  test('returns undefined for invalid JSON', () => {
    expect(opencodeAdapter.parseUsage!('garbage data')).toBeUndefined()
  })

  test('returns undefined when no step_finish events', () => {
    const output = [
      '{"type":"step_start","sessionID":"ses_x"}',
      '{"type":"text","sessionID":"ses_x","part":{"type":"text","text":"hi"}}',
    ].join('\n')
    expect(opencodeAdapter.parseUsage!(output)).toBeUndefined()
  })

  test('omits zero-value cache and reasoning', () => {
    const output = [
      '{"type":"step_finish","sessionID":"s1","part":{"reason":"end_turn","cost":0.001,"tokens":{"input":100,"output":50,"reasoning":0,"cache":{"read":0,"write":0}}}}',
    ].join('\n')
    const usage = opencodeAdapter.parseUsage!(output)
    expect(usage).toBeDefined()
    expect(usage!.input_tokens).toBe(100)
    expect(usage!.output_tokens).toBe(50)
    expect(usage!.cache_read_tokens).toBeUndefined()
    expect(usage!.cache_write_tokens).toBeUndefined()
    expect(usage!.thinking_tokens).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Pi - NDJSON with session + model_change + message_end
// ---------------------------------------------------------------------------
describe('piAdapter.parseUsage', () => {
  test('parses session, model, and usage from NDJSON', () => {
    const output = [
      '{"type":"session","version":3,"id":"pi-sess-123"}',
      '{"type":"model_change","provider":"openrouter","modelId":"moonshotai/kimi-k2.5"}',
      '{"type":"message_end","usage":{"input":4500,"output":1200,"cacheRead":2000,"cacheWrite":500,"cost":{"total":0.003}}}',
      '{"type":"agent_end","messages":[{"role":"assistant","content":"done"}]}',
    ].join('\n')

    const usage = piAdapter.parseUsage!(output)
    expect(usage).toBeDefined()
    expect(usage!.input_tokens).toBe(4500)
    expect(usage!.output_tokens).toBe(1200)
    expect(usage!.cache_read_tokens).toBe(2000)
    expect(usage!.cache_write_tokens).toBe(500)
    expect(usage!.cost_usd).toBe(0.003)
    expect(usage!.session_id).toBe('pi-sess-123')
    expect(usage!.model_used).toBe('moonshotai/kimi-k2.5')
  })

  test('returns undefined for empty string', () => {
    expect(piAdapter.parseUsage!('')).toBeUndefined()
  })

  test('returns undefined for invalid JSON', () => {
    expect(piAdapter.parseUsage!('not json')).toBeUndefined()
  })

  test('returns undefined when no message_end event', () => {
    const output = [
      '{"type":"session","version":3,"id":"pi-sess-456"}',
      '{"type":"model_change","provider":"openrouter","modelId":"some-model"}',
    ].join('\n')
    expect(piAdapter.parseUsage!(output)).toBeUndefined()
  })

  test('aggregates multiple message_end events', () => {
    const output = [
      '{"type":"session","version":3,"id":"pi-multi"}',
      '{"type":"message_end","usage":{"input":1000,"output":500,"cacheRead":0,"cacheWrite":0,"cost":{"total":0.001}}}',
      '{"type":"message_end","usage":{"input":2000,"output":300,"cacheRead":100,"cacheWrite":0,"cost":{"total":0.002}}}',
    ].join('\n')
    const usage = piAdapter.parseUsage!(output)
    expect(usage).toBeDefined()
    expect(usage!.input_tokens).toBe(3000)
    expect(usage!.output_tokens).toBe(800)
    expect(usage!.cache_read_tokens).toBe(100)
    expect(usage!.cost_usd).toBeCloseTo(0.003)
  })
})

// ---------------------------------------------------------------------------
// Gemini - single JSON with stats object
// ---------------------------------------------------------------------------
describe('geminiAdapter.parseUsage', () => {
  test('parses full Gemini JSON output', () => {
    const output = JSON.stringify({
      session_id: 'gem-sess-456',
      response: 'hello world',
      stats: {
        models: {
          'gemini-2.5-flash': {
            api: { totalRequests: 3, totalErrors: 0, totalLatencyMs: 4500 },
            tokens: {
              input: 4500,
              candidates: 1200,
              cached: 2000,
              thoughts: 800,
              tool: 150,
              total: 6500,
            },
          },
        },
      },
    })

    const usage = geminiAdapter.parseUsage!(output)
    expect(usage).toBeDefined()
    expect(usage!.input_tokens).toBe(4500)
    expect(usage!.output_tokens).toBe(1200)
    expect(usage!.cache_read_tokens).toBe(2000)
    expect(usage!.thinking_tokens).toBe(800)
    expect(usage!.tool_tokens).toBe(150)
    expect(usage!.api_duration_ms).toBe(4500)
    expect(usage!.session_id).toBe('gem-sess-456')
    expect(usage!.model_used).toBe('gemini-2.5-flash')
  })

  test('returns undefined for empty string', () => {
    expect(geminiAdapter.parseUsage!('')).toBeUndefined()
  })

  test('returns undefined for invalid JSON', () => {
    expect(geminiAdapter.parseUsage!('not json')).toBeUndefined()
  })

  test('returns undefined when no stats.models', () => {
    const output = JSON.stringify({ response: 'hi', session_id: 'x' })
    expect(geminiAdapter.parseUsage!(output)).toBeUndefined()
  })

  test('returns undefined when models object is empty', () => {
    const output = JSON.stringify({ stats: { models: {} } })
    expect(geminiAdapter.parseUsage!(output)).toBeUndefined()
  })

  test('omits zero-value optional fields', () => {
    const output = JSON.stringify({
      stats: {
        models: {
          'gemini-2.5-pro': {
            tokens: { input: 500, candidates: 200, cached: 0, thoughts: 0, tool: 0, total: 700 },
          },
        },
      },
    })
    const usage = geminiAdapter.parseUsage!(output)
    expect(usage).toBeDefined()
    expect(usage!.input_tokens).toBe(500)
    expect(usage!.output_tokens).toBe(200)
    expect(usage!.cache_read_tokens).toBeUndefined()
    expect(usage!.thinking_tokens).toBeUndefined()
    expect(usage!.tool_tokens).toBeUndefined()
    expect(usage!.model_used).toBe('gemini-2.5-pro')
  })
})

// ---------------------------------------------------------------------------
// Codex - JSONL with thread.started + turn.completed
// ---------------------------------------------------------------------------
describe('codexAdapter.parseUsage', () => {
  test('aggregates multiple turn.completed events', () => {
    const output = [
      '{"type":"thread.started","thread_id":"thread_abc123"}',
      '{"type":"turn.completed","usage":{"input_tokens":3000,"cached_input_tokens":1500,"output_tokens":800}}',
      '{"type":"turn.completed","usage":{"input_tokens":1500,"cached_input_tokens":500,"output_tokens":400}}',
    ].join('\n')

    const usage = codexAdapter.parseUsage!(output)
    expect(usage).toBeDefined()
    expect(usage!.input_tokens).toBe(4500)
    expect(usage!.output_tokens).toBe(1200)
    expect(usage!.cache_read_tokens).toBe(2000)
    expect(usage!.session_id).toBe('thread_abc123')
  })

  test('returns undefined for empty string', () => {
    expect(codexAdapter.parseUsage!('')).toBeUndefined()
  })

  test('returns undefined for invalid JSON', () => {
    expect(codexAdapter.parseUsage!('garbage')).toBeUndefined()
  })

  test('returns undefined when no turn.completed events', () => {
    const output = '{"type":"thread.started","thread_id":"thread_xyz"}'
    expect(codexAdapter.parseUsage!(output)).toBeUndefined()
  })

  test('omits cache_read_tokens when zero', () => {
    const output = [
      '{"type":"turn.completed","usage":{"input_tokens":1000,"cached_input_tokens":0,"output_tokens":500}}',
    ].join('\n')
    const usage = codexAdapter.parseUsage!(output)
    expect(usage).toBeDefined()
    expect(usage!.input_tokens).toBe(1000)
    expect(usage!.output_tokens).toBe(500)
    expect(usage!.cache_read_tokens).toBeUndefined()
    expect(usage!.session_id).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Cline - NDJSON with double-parsed api_req_finished
// ---------------------------------------------------------------------------
describe('clineAdapter.parseUsage', () => {
  test('parses double-encoded api_req_finished', () => {
    const output = [
      '{"type":"say","say":"task_started","ts":1770858797370}',
      '{"type":"say","say":"api_req_finished","text":"{\\"tokensIn\\":4500,\\"tokensOut\\":1200,\\"totalCost\\":0.035,\\"cacheReads\\":2000,\\"cacheWrites\\":500}"}',
      '{"type":"say","say":"completion_result","text":"done"}',
    ].join('\n')

    const usage = clineAdapter.parseUsage!(output)
    expect(usage).toBeDefined()
    expect(usage!.input_tokens).toBe(4500)
    expect(usage!.output_tokens).toBe(1200)
    expect(usage!.cache_read_tokens).toBe(2000)
    expect(usage!.cache_write_tokens).toBe(500)
    expect(usage!.cost_usd).toBe(0.035)
  })

  test('returns undefined for empty string', () => {
    expect(clineAdapter.parseUsage!('')).toBeUndefined()
  })

  test('returns undefined for invalid JSON', () => {
    expect(clineAdapter.parseUsage!('not json')).toBeUndefined()
  })

  test('returns undefined when no api_req_finished event', () => {
    const output = [
      '{"type":"say","say":"task_started","ts":1770858797370}',
      '{"type":"say","say":"completion_result","text":"done"}',
    ].join('\n')
    expect(clineAdapter.parseUsage!(output)).toBeUndefined()
  })

  test('uses last api_req_finished for cumulative totals', () => {
    const output = [
      '{"type":"say","say":"api_req_finished","text":"{\\"tokensIn\\":1000,\\"tokensOut\\":200,\\"totalCost\\":0.01,\\"cacheReads\\":0,\\"cacheWrites\\":0}"}',
      '{"type":"say","say":"api_req_finished","text":"{\\"tokensIn\\":3000,\\"tokensOut\\":800,\\"totalCost\\":0.03,\\"cacheReads\\":500,\\"cacheWrites\\":100}"}',
    ].join('\n')
    const usage = clineAdapter.parseUsage!(output)
    expect(usage).toBeDefined()
    // Uses last event (cumulative totals from Cline)
    expect(usage!.input_tokens).toBe(3000)
    expect(usage!.output_tokens).toBe(800)
    expect(usage!.cost_usd).toBe(0.03)
    expect(usage!.cache_read_tokens).toBe(500)
    expect(usage!.cache_write_tokens).toBe(100)
  })

  test('omits zero cache values', () => {
    const output = [
      '{"type":"say","say":"api_req_finished","text":"{\\"tokensIn\\":100,\\"tokensOut\\":50,\\"totalCost\\":0.001,\\"cacheReads\\":0,\\"cacheWrites\\":0}"}',
    ].join('\n')
    const usage = clineAdapter.parseUsage!(output)
    expect(usage).toBeDefined()
    expect(usage!.cache_read_tokens).toBeUndefined()
    expect(usage!.cache_write_tokens).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Copilot - stderr parsing
// ---------------------------------------------------------------------------
describe('copilotAdapter.parseUsage', () => {
  test('parses premium requests, API time, and token lines from stderr', () => {
    const stderr = `Total usage est: 3 Premium requests
API time spent: 45s
Total session time: 62s
Total code changes: +150 -30

claude-opus-4.6   12.5k in, 3200 out, 8.1k cached (Est. 3 Premium requests)`

    const usage = copilotAdapter.parseUsage!('', stderr)
    expect(usage).toBeDefined()
    expect(usage!.premium_requests).toBe(3)
    expect(usage!.api_duration_ms).toBe(45000)
    expect(usage!.input_tokens).toBe(12500)
    expect(usage!.output_tokens).toBe(3200)
    expect(usage!.cache_read_tokens).toBe(8100)
  })

  test('returns undefined when stderr is empty', () => {
    expect(copilotAdapter.parseUsage!('', '')).toBeUndefined()
  })

  test('returns undefined when stderr is undefined', () => {
    expect(copilotAdapter.parseUsage!('')).toBeUndefined()
  })

  test('parses tokens without k suffix', () => {
    const stderr = `some-model   500 in, 200 out, 100 cached (Est. 1 Premium requests)`
    const usage = copilotAdapter.parseUsage!('', stderr)
    expect(usage).toBeDefined()
    expect(usage!.input_tokens).toBe(500)
    expect(usage!.output_tokens).toBe(200)
    expect(usage!.cache_read_tokens).toBe(100)
  })

  test('aggregates multiple model token lines', () => {
    const stderr = `Total usage est: 5 Premium requests
API time spent: 60s

claude-opus-4.6    10k in, 2k out, 5k cached (Est. 3 Premium requests)
gemini-2.5-pro   5k in, 1k out (Est. 2 Premium requests)`

    const usage = copilotAdapter.parseUsage!('', stderr)
    expect(usage).toBeDefined()
    expect(usage!.premium_requests).toBe(5)
    expect(usage!.api_duration_ms).toBe(60000)
    expect(usage!.input_tokens).toBe(15000)
    expect(usage!.output_tokens).toBe(3000)
    expect(usage!.cache_read_tokens).toBe(5000)
  })

  test('parses only premium requests when no token lines', () => {
    const stderr = `Total usage est: 1 Premium requests
API time spent: 10s`
    const usage = copilotAdapter.parseUsage!('', stderr)
    expect(usage).toBeDefined()
    expect(usage!.premium_requests).toBe(1)
    expect(usage!.api_duration_ms).toBe(10000)
    expect(usage!.input_tokens).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Agents without parseUsage
// ---------------------------------------------------------------------------
describe('agents without parseUsage', () => {
  test('cursorAdapter.parseUsage is undefined', () => {
    expect(cursorAdapter.parseUsage).toBeUndefined()
  })

  test('kiroAdapter.parseUsage is undefined', () => {
    expect(kiroAdapter.parseUsage).toBeUndefined()
  })

  test('vibeAdapter.parseUsage is undefined', () => {
    expect(vibeAdapter.parseUsage).toBeUndefined()
  })
})
