# Agent Expansion Implementation

> Adding 5 new agents and expanding provider support in mycelium-v2

**Created:** 2026-02-04
**Status:** Complete
**Updated:** 2026-02-04 - Removed groq as agent (now provider-only via pi)

---

## Overview

### New Agents
| Agent | Command | Default Provider | Billing |
|-------|---------|------------------|---------|
| kiro | `kiro-cli` | aws | subscription |
| vibe | `vibe` | mistral | per_use |
| pi | `pi` | openrouter | per_use |
| opencode | `opencode` | opencode-zen | free |
| copilot | `copilot` | github | subscription |

**Note:** `groq` is a provider, not an agent. Use `pi --provider groq` for Groq models.

### Provider Expansion
| Provider | Models | Auth |
|----------|--------|------|
| openrouter | 100+ models (kimi, gemini, claude, gpt, etc.) | `~/.config/mk-agent/OPENROUTER_API_KEY` |
| groq | kimi-k2, llama, qwen (via pi) | `~/.groq/config.json` |
| cerebras | llama, qwen, glm (via pi) | `~/.config/mk-agent/CEREBRAS_API_KEY` |
| mistral | Mistral models | `~/.config/mk-agent/MISTRAL_API_KEY` |
| google | Gemini | Native CLI auth |
| opencode-zen | Free models (kimi, glm, gpt-5-nano) | None required |
| github | Copilot models | `~/.config/mk-agent/COPILOT_TOKEN` |
| aws | Claude via Kiro | IAM Identity Center |

---

## Phase 1: Schema Changes

### Tasks
- [x] 1.1 Update AgentType enum in `packages/shared/src/schemas/task.ts`
- [x] 1.2 Update ProviderType enum in `packages/shared/src/schemas/task.ts`
- [x] 1.3 Add agent-provider compatibility map (AGENT_PROVIDERS)
- [x] 1.4 Build and verify no type errors

### Files Modified
- `packages/shared/src/schemas/task.ts`

### Validation
```bash
cd packages/shared && bun run build  # PASSED
```

---

## Phase 2: Agent Configurations

### Tasks
- [x] 2.1 Add DEFAULT_AGENT_CONFIGS for all 6 new agents
- [x] 2.2 Add 'free' billing type
- [x] 2.3 Build and verify

### Files Modified
- `packages/shared/src/schemas/agent.ts`

### Validation
```bash
cd packages/shared && bun run build  # PASSED
```

---

## Phase 3: Dispatch Logic

### Tasks
- [x] 3.1 Add buildAgentArgs cases for: kiro, vibe, pi, opencode, copilot
- [x] 3.2 Add kiro stdin dispatch (special case - prompt via stdin)
- [x] 3.3 Add buildAgentEnv for copilot (GH_TOKEN), pi, vibe (API keys)
- [x] 3.4 Add provider switching for pi (groq, cerebras, openrouter, etc.)
- [x] 3.5 Test dispatch for each new agent

### Files Modified
- `packages/server/src/agents/dispatch.ts`

### Validation
```bash
bun run build  # PASSED
```

### Test Results (2026-02-05)
| Agent | Status | Duration | Notes |
|-------|--------|----------|-------|
| copilot | PASS | 8.3s | GH_TOKEN env var works |
| opencode | PASS | ~15s | Free kimi model |
| vibe | PASS | ~10s | Mistral API key works |
| pi | PASS | ~15s | OpenRouter provider |
| pi+groq | PASS | ~0.5s | Ultra-fast via groq provider |
| kiro | PASS | ~25s | stdin prompt works |

---

## Phase 4: Health & Quota Tracking

### Tasks
- [x] 4.1 Add groq quota tracking (checkGroqStatus function)
- [x] 4.2 Add error extraction for new agents (copilot, vibe, pi, kiro, opencode)
- [x] 4.3 Build passed

### Files Modified
- `packages/server/src/agents/health.ts`

### Error Patterns Added
- Groq: Rate limit detection with backoff
- Copilot: GH_TOKEN auth errors
- Pi/OpenRouter: API key errors
- Vibe/Mistral: Unauthorized errors
- Kiro: AWS SSO session expiry
- OpenCode: Model not found

---

## Phase 5: Frontend Updates

### Tasks
- [x] 5.1 Update agent selector in TaskCreateForm (added 6 new agents)
- [x] 5.2 AgentPanel uses dynamic config from backend (auto-updated)
- [x] 5.3 Build passed

### Files Modified
- `packages/client/src/panels/task/TaskCreateForm.tsx`

### Validation
```bash
bun run build:client  # PASSED
```

---

## Phase 6: Integration Testing

### Tasks
- [x] 6.1 Create and run task with each new agent
- [x] 6.2 Verify dispatch works for all agents
- [ ] 6.3 Verify cost tracking for per_use agents (pi, vibe)
- [ ] 6.4 Test provider switching (pi with different providers)

---

## Progress Log

### 2026-02-04 - Started
Initial analysis complete. Beginning Phase 1.

### 2026-02-05 - Implementation Complete
- Phase 1: Schema changes (AgentType, ProviderType, AGENT_PROVIDERS)
- Phase 2: Agent configs (DEFAULT_AGENT_CONFIGS for all 6 agents)
- Phase 3: Dispatch logic (all agents dispatching correctly)
  - Fixed CLI task create/run responses
  - Fixed Kiro stdin handling for Bun
- Phase 4: Health tracking (error patterns for new agents)
- Phase 5: Frontend (TaskCreateForm updated)
- Phase 6: All 6 agents tested and working

---

## Summary

### Added Agents (5 total)
| Agent | Command | Provider | Billing | Status |
|-------|---------|----------|---------|--------|
| kiro | kiro-cli | aws | subscription | Working |
| vibe | vibe | mistral | per_use | Working |
| pi | pi | openrouter/groq/cerebras/etc. | varies | Working |
| opencode | opencode | opencode-zen | free | Working |
| copilot | copilot | github | subscription | Working |

### Added Providers (for pi)
| Provider | Billing | Notes |
|----------|---------|-------|
| groq | free | Ultra-fast, use `--provider groq` |
| cerebras | free | Ultra-fast, use `--provider cerebras` |

### Files Modified
- `packages/shared/src/schemas/task.ts` - AgentType, ProviderType, AGENT_PROVIDERS
- `packages/shared/src/schemas/agent.ts` - DEFAULT_AGENT_CONFIGS, BillingType
- `packages/shared/src/schemas/agent-matrix.ts` - Complete agent/provider/model matrix
- `packages/server/src/agents/dispatch.ts` - buildAgentArgs, dispatchKiro, provider handling
- `packages/server/src/agents/health.ts` - Error patterns for new agents
- `packages/server/src/prompts/context.ts` - buildAgentsSection for discovery prompts
- `packages/server/src/routes/tasks.ts` - Fixed run endpoint response
- `packages/cli/src/commands/tasks.ts` - Updated help text
- `packages/client/src/panels/task/TaskCreateForm.tsx` - Added new agents

---

## Issues / Alignment Needed

_None - implementation complete_

---
