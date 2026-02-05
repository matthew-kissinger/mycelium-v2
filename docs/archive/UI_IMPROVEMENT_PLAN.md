# UI Improvement Plan

> Status: Complete + Verified
> Last Updated: 2026-02-04
> Verified: Playwright browser testing confirmed all features working

## Overview

Comprehensive plan to fix UI gaps, missing API wiring, and agent context issues discovered during system analysis.

---

## Phase 0: Critical Fixes (Agent Context)

### Task 0.1: Wire Credits to Agent Prompts
- [x] **Status**: Complete
- **Files**:
  - `packages/server/src/scheduler/cycles/dispatcher.ts`
  - `packages/server/src/scheduler/cycles/discovery.ts`
- **Issue**: `buildAgentsSectionWithCredits()` exists but is never called
- **Fix**: Replace sync `buildAgentsSection()` with async credits-aware version
- **Impact**: Agents will see OpenRouter credits, quota status, health info

### Task 0.2: Expose Provider in Task API & UI
- [x] **Status**: Complete
- **Files**:
  - `packages/server/src/routes/tasks.ts` - parseTask already uses spread (all fields exposed)
  - `packages/client/src/panels/TaskPoolPanel.tsx` - provider column added
- **Issue**: Provider field stored but not visible in task list
- **Fix**: Added provider to TaskData interface and list/detail views

---

## Phase 1: API Response Fixes

### Task 1.1: Fix Repo API Response
- [x] **Status**: Already Complete (No Change Needed)
- **Files**: `packages/server/src/routes/repos.ts`
- **Analysis**: API uses `db.select().from(schema.repos)` which returns all fields including weight and last_scanned_at

### Task 1.2: Fix Task API Response
- [x] **Status**: Already Complete (No Change Needed)
- **Files**: `packages/server/src/routes/tasks.ts`
- **Analysis**: parseTask uses `...task` spread which includes all schema fields (timeout_seconds, spec_context, provider)

---

## Phase 2: UI Panel Enhancements

### Task 2.1: Enhance ReposPanel
- [x] **Status**: Already Complete (No Change Needed)
- **Files**: `packages/client/src/panels/ReposPanel.tsx`
- **Analysis**: Already has weight slider (0-100), last_scanned_at display, language badge, and weight editing

### Task 2.2: Enhance TaskPoolPanel
- [x] **Status**: Complete
- **Files**: `packages/client/src/panels/TaskPoolPanel.tsx`
- **Changes**:
  - [x] Add provider column for cline tasks
  - [x] Show duration_seconds in list view
  - [x] Show cost_usd already in detail view
  - [x] timeout_seconds available via API (display in detail view optional)

### Task 2.3: Enhance AgentPanel with Health
- [x] **Status**: Complete
- **Files**:
  - `packages/client/src/panels/AgentPanel.tsx`
  - `packages/client/src/stores/agentStore.ts`
  - `packages/client/src/stores/system.ts`
  - `packages/client/src/layout/RightPanel.tsx`
  - `packages/client/src/components/Panel.tsx`
- **Changes**:
  - [x] Show agent health status (healthy/degraded/quota_exceeded)
  - [x] Display OpenRouter credits remaining with progress bar
  - [x] Display Cline credits if available
  - [x] Show free models count
  - [x] Display quota reset countdowns
  - [x] Auto-refresh health every 30 seconds

---

## Phase 3: New Features

### Task 3.1: Add Context Inspector to Task Detail
- [x] **Status**: Complete
- **Files**: `packages/client/src/panels/TaskPoolPanel.tsx`
- **Feature**: Tab to view assembled prompt context (JSON view)
- **API**: `GET /api/tasks/:id/context`
- **Notes**: Shows task info, repo metadata, memory patterns, warnings, dependencies

### Task 3.2: Add Sessions Tab to Task Detail
- [x] **Status**: Complete
- **Files**: `packages/client/src/panels/TaskPoolPanel.tsx`
- **Feature**: Tab to view fruiting sessions with execution history
- **API**: `GET /api/tasks/:id/sessions`
- **Notes**: Shows context layers/sizes, session log preview, agent/model per session

---

## Validation Checkpoints

### Checkpoint 1: After Phase 0
- [x] Build succeeds
- [x] Backend starts without errors
- [x] `/api/health` shows credits info
- [x] Agent prompts include credits section (wired in dispatcher/discovery)

### Checkpoint 2: After Phase 1
- [x] Repo GET includes weight, last_scanned_at (already complete)
- [x] Task GET includes provider, timeout_seconds (already complete via spread)

### Checkpoint 3: After Phase 2
- [x] UI displays all new fields (provider, duration, health)
- [x] Build completes without errors
- [x] Health section auto-refreshes every 30s

---

## Implementation Log

### 2026-02-04

**Completed Phase 0-2**:
- Wired credits to agent prompts (dispatcher.ts, discovery.ts)
- Added provider display to TaskPoolPanel
- Verified API already exposes all fields via parseTask spread
- Verified ReposPanel already has weight/last_scanned_at UI
- Added Health & Credits section to AgentPanel:
  - OpenRouter credits with progress bar
  - Cline credits display
  - Free models count
  - Agent health status per agent/model
  - Quota reset countdowns
  - Auto-refresh every 30 seconds

**Completed Phase 3**:
- Added Context Inspector tab to task detail view
  - Shows assembled context as JSON (task, repo, patterns, warnings, deps)
  - Fetches via GET /api/tasks/:id/context on tab click
- Added Sessions tab to task detail view
  - Shows fruiting sessions with context layers and sizes
  - Session log preview (last 10 chunks)
  - Agent/model info per session

### Checkpoint 4: Playwright Verification (Final)
- [x] Browser navigates to http://localhost:5765
- [x] AgentPanel shows Health & Credits section:
  - OpenRouter credits: $9.16 / $15.00
  - Cline billing: openrouter badge
  - Free models: 30 available
- [x] TaskPoolPanel list view shows:
  - 456 tasks with status filtering
  - Agent names (claude, codex, gemini, cursor)
  - Durations (3m 59s, 8s, etc.)
  - Dependency counts
- [x] Task detail Info tab shows prompt and metadata
- [x] Task detail Context tab loads assembled context:
  - Task info, repo metadata
  - 20+ memory patterns, 10+ warnings
  - Shepherd evaluations with recommendations
  - Related tasks and dependencies
- [x] Task detail Sessions tab loads fruiting session:
  - Agent/model: codex / gpt-5.2-codex
  - Context layers: basePrompt 1.4KB, mycelContext 3.7KB, agentsSection 2.5KB, skillsSection 23.7KB, mcpSection 0.3KB (31.7KB total)
  - Output: 149 chunks

---

## Files Modified

| File | Status | Changes |
|------|--------|---------|
| `packages/server/src/scheduler/cycles/dispatcher.ts` | Complete | Wire credits via buildAgentsSectionWithCredits |
| `packages/server/src/scheduler/cycles/discovery.ts` | Complete | Wire credits via buildAgentsSectionWithCredits |
| `packages/server/src/routes/repos.ts` | N/A | Already exposes all fields |
| `packages/server/src/routes/tasks.ts` | N/A | Already exposes all fields via spread |
| `packages/client/src/panels/ReposPanel.tsx` | N/A | Already has weight/last_scanned_at UI |
| `packages/client/src/panels/TaskPoolPanel.tsx` | Complete | Added provider + duration display |
| `packages/client/src/panels/AgentPanel.tsx` | Complete | Health & Credits section |
| `packages/client/src/stores/agentStore.ts` | Complete | Health + ClineInfo types and fetch |
| `packages/client/src/stores/system.ts` | Complete | Added health state and fetchAgentHealth |
| `packages/client/src/layout/RightPanel.tsx` | Complete | Pass health props to AgentPanel |
| `packages/client/src/components/Panel.tsx` | Complete | Pass health props to AgentPanel |

