# Monitoring the Loop

End-to-end monitoring of the Mycelium v2 autonomous agent loop.

## Purpose
Run the full system loop (discovery -> dispatch -> execution -> shepherd -> merge/reject)
and observe it over time. Record failures, bottlenecks, and data for the next upgrade.

## Session Log
- `session-001.md` - First monitoring session (2026-02-10)

## Findings
Accumulated across sessions. Updated as patterns emerge.

## Method
1. Start system (backend + frontend + scheduler)
2. Let autodiscovery run against registered repos
3. Monitor every 5 min (extending intervals as system stabilizes)
4. Record: task flow, agent health, cycle timing, errors, resource usage
5. Continue until something breaks or enough data collected
