---
name: Fix Enrich Reliability
overview: Diagnose and stabilize Twitter/video enrichment so Vercel returns quickly and UI reliably shows enrichment state for latest runs.
todos:
  - id: backend-fast-return
    content: Ensure enrich endpoint is strictly bounded and returns fallback payload quickly on slow upstream calls.
    status: completed
  - id: backend-persistence-contract
    content: Make run enrichment persistence explicit; treat write/read failures distinctly from empty data.
    status: completed
  - id: status-endpoint-resilience
    content: Prevent enrich-status from converting transient polling errors into misleading final states.
    status: completed
  - id: frontend-polling-ux
    content: Stop swallowing non-OK enrich-status responses and surface actionable progress/error messaging.
    status: completed
  - id: local-vercel-smoke
    content: Validate full local vercel dev flow end-to-end, then confirm with latest production run logs.
    status: in_progress
isProject: false
---

# Fix Twitter/Video Enrichment Reliability

## What is currently broken

- `enrich` requests can hit Vercel invocation timeout (`504`) before returning, so no enrichment is persisted for the run.
- `Runs` payload then shows `enrichment: null`, which makes Twitter/video appear missing.
- Frontend polling currently swallows `enrich-status` failures and can show a misleading "completed" state even when backend polling failed.

## Root causes found

- **Backend timeout/persistence coupling** in `[/Users/vaibhavarora/.cursor/worktrees/content-team/ywwe/api/scripts/enrich.ts](/Users/vaibhavarora/.cursor/worktrees/content-team/ywwe/api/scripts/enrich.ts)`: long upstream calls + weak handling of persistence failures can leave no stored enrichment row.
- **Status endpoint failure handling** in `[/Users/vaibhavarora/.cursor/worktrees/content-team/ywwe/api/scripts/enrich-status.ts](/Users/vaibhavarora/.cursor/worktrees/content-team/ywwe/api/scripts/enrich-status.ts)`: failed reads/status checks can resolve to no useful state and not recover gracefully.
- **Frontend masking behavior** in `[/Users/vaibhavarora/.cursor/worktrees/content-team/ywwe/src/pages/GeneratePage.tsx](/Users/vaibhavarora/.cursor/worktrees/content-team/ywwe/src/pages/GeneratePage.tsx)`: non-OK `enrich-status` responses are ignored in loop and timeout path marks enrich as completed.
- **Missing enrichment visibility messaging** in `[/Users/vaibhavarora/.cursor/worktrees/content-team/ywwe/src/pages/RunsPage.tsx](/Users/vaibhavarora/.cursor/worktrees/content-team/ywwe/src/pages/RunsPage.tsx)` and `[/Users/vaibhavarora/.cursor/worktrees/content-team/ywwe/src/components/content/ScriptResultsPanel.tsx](/Users/vaibhavarora/.cursor/worktrees/content-team/ywwe/src/components/content/ScriptResultsPanel.tsx)`: users cannot distinguish "not enriched yet" vs "enrich failed".

## Execution plan

1. Harden backend orchestration so `enrich` always returns fast and never blocks on slow dependencies.
2. Make enrichment persistence explicit and verifiable (do not silently treat failed/timeout persistence as success).
3. Improve `enrich-status` to avoid false terminal failures on transient worker/network issues.
4. Update frontend polling/error states so backend failures are visible and not mislabeled as success.
5. Run local `vercel dev` smoke tests for `/api/scripts/enrich`, `/api/scripts/enrich-status`, and `/api/runs/get` on a fresh run; then verify same flow in production.
6. Add lightweight logging around enrich lifecycle (`start`, `twitter_done`, `job_queued`, `persist_ok/persist_fail`) to speed up future debugging.

