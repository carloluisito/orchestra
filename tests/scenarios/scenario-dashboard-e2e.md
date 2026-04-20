# Scenario: Dashboard & Token Tracking — End-to-End

## Purpose

Validate the complete dashboard and token tracking flow across an entire Orchestra run. This scenario traces the lifecycle of the dashboard server, SSE event delivery, and token usage recording from initialization through completion, confirming that the browser UI accurately reflects Orchestra state at each stage and that token data is correctly computed, persisted, and displayed.

**Input fixtures:**
- Spec: `tests/fixtures/sample-spec.md` (Task Management API specification)
- Plan: `tests/fixtures/sample-plan.md` (4-phase, 16-step implementation plan)

---

## Configuration

| Setting | Value | Rationale |
|---|---|---|
| `autonomy` | `checkpoint` | Standard mode; pauses between waves allow verifying dashboard updates at each boundary |
| `max_parallel` | `3` | Enables parallel task execution to verify concurrent running indicators |
| `max_retries` | `2` | Allows testing retry token accumulation |
| `token_budget` | `80000` | Default per-task budget for percentage calculations |
| `agent_model` | `sonnet` | Default |
| `use_worktrees` | `true` | Default |

---

## Step 1: Initialize

**Command:**
```
/orchestra run tests/fixtures/sample-spec.md tests/fixtures/sample-plan.md
```

Accept all default configuration when prompted.

### Expected Behavior

1. State Manager creates `.orchestra/` directory structure.
2. State Manager creates `.orchestra/token-usage.json` with zero totals.
3. `start-dashboard.sh` is invoked with `--orchestra-dir .orchestra`.
4. Dashboard server starts and writes `.orchestra/dashboard-info.json` with the URL and port.
5. User is told the dashboard URL (e.g., "Dashboard running at http://localhost:PORT").
6. Dashboard server begins watching `.orchestra/` for file changes.

### Validations

**Token tracking initialization:**
- [ ] `.orchestra/token-usage.json` exists immediately after initialization
- [ ] File contains the zero-state structure:
  ```json
  {
    "run_total": {
      "input_tokens": 0,
      "output_tokens": 0,
      "total_tokens": 0,
      "total_budget": 0
    },
    "tasks": {}
  }
  ```
- [ ] `total_budget` is `0` at this stage (updated after decomposition when task budgets are known)

**Dashboard server startup:**
- [ ] `scripts/start-dashboard.sh` is called during Step 3 (Initialize State) of the run flow
- [ ] `.orchestra/dashboard-info.json` exists and contains `{"url": "http://localhost:PORT"}` where PORT is a valid port number
- [ ] User is told the dashboard URL in the terminal output
- [ ] Dashboard server process is running (verifiable via PID in dashboard-info.json or process list)
- [ ] On Windows (Git Bash): server started with `run_in_background: true` on the Bash tool call
- [ ] On macOS/Linux: server started via `nohup` + `disown`

**Dashboard UI on first load:**
- [ ] Opening the URL in a browser loads `dashboard.html` successfully
- [ ] Header bar shows connection status as green dot ("Connected")
- [ ] Header bar shows project name (from config)
- [ ] Header bar shows autonomy level ("checkpoint") and model ("sonnet")
- [ ] Task list area is empty (no tasks exist yet)
- [ ] Progress bar shows 0% (0/0 tasks)
- [ ] Token usage section shows "0 / 0" (no budget allocated yet)
- [ ] Events log is empty or shows only the initialization entry

**SSE connection:**
- [ ] Browser establishes an EventSource connection to `/events`
- [ ] Server sends initial full state snapshot on connect
- [ ] Keepalive comments (`: keepalive\n\n`) are sent every 15 seconds

---

## Step 2: After Decomposition

After the Decomposer classifies input and produces the task DAG, the dashboard should reflect all tasks and their budgets.

### Expected Behavior

1. Decomposer writes task files to `.orchestra/tasks/` and `dag.md`.
2. Dashboard server detects file changes (debounced at 100ms).
3. Server re-parses `.orchestra/` state and pushes a new SSE snapshot.
4. `token-usage.json` is updated with `total_budget` (sum of all task budgets).
5. Browser receives the snapshot and renders all tasks and waves.

### Validations

**Dashboard task display:**
- [ ] Dashboard updates live without browser refresh
- [ ] All tasks appear in the task list grouped by wave
- [ ] Wave headers show wave numbers (Wave 1, Wave 2, etc.) with correct task groupings
- [ ] All tasks show "pending" status with dim circle indicators
- [ ] Pending tasks show their dependency blocks (e.g., "blocked by T001")
- [ ] Wave 1 tasks show as "ready" (blue circle, no blocking dependencies)

**Token budget display:**
- [ ] `total_budget` in `token-usage.json` is updated to the sum of all task budgets
- [ ] Stats row shows total budget formatted (e.g., "640k")
- [ ] Token usage section shows run total progress bar at 0%
- [ ] Per-task mini bars are empty (no tokens consumed yet)

**Progress tracking:**
- [ ] Stats row shows "0/{TOTAL_TASKS} tasks" completed
- [ ] Progress bar is at 0%
- [ ] Current wave shows "1"

**Events log:**
- [ ] Events section shows decomposition entry with timestamp
- [ ] DAG creation entry is visible

---

## Step 3: After Wave 1 Completion

Wave 1 contains a single task (T001 — project initialization). After it completes, the dashboard should show the first completed task with token usage data.

### Expected Behavior

1. T001 dispatched; Context Curator records estimated input token count.
2. Sub-agent completes T001; Agent tool returns `total_tokens`, `tool_uses`, `duration_ms`.
3. Result Collector extracts token usage and computes:
   - `input_tokens` = estimated from Context Curator
   - `output_tokens` = `total_tokens - input_tokens`
   - `budget_used_pct` = `(total_tokens / task_budget) * 100`
4. Result Collector writes updated entry to `.orchestra/token-usage.json`.
5. Dashboard server detects changes, pushes new SSE snapshot.

### Validations

**Task status update:**
- [ ] T001 shows green checkmark indicator in the dashboard
- [ ] T001 row displays token usage: "X.Xk tokens (XX%)" format
- [ ] Wave 1 header shows status "Complete"
- [ ] Wave 2 tasks transition from "pending" to "ready" (blue indicators)

**Token tracking (token-usage.json):**
- [ ] `token-usage.json` has a `tasks.001` entry with all fields:
  - `title`: task title string
  - `budget`: the task's token budget (from task frontmatter)
  - `input_tokens`: positive integer (estimated input from Context Curator)
  - `output_tokens`: positive integer (total minus input estimate)
  - `total_tokens`: positive integer (from Agent tool result)
  - `budget_used_pct`: number between 0 and 100+ (percentage of task budget used)
  - `retries`: `0` (no retries on T001 in happy path)
  - `duration_ms`: positive integer (from Agent tool result)
- [ ] `run_total` is updated:
  - `input_tokens` equals T001's `input_tokens`
  - `output_tokens` equals T001's `output_tokens`
  - `total_tokens` equals T001's `total_tokens`
  - `total_budget` unchanged (still the sum of all task budgets)

**Dashboard token panel:**
- [ ] Token usage section shows updated run total progress bar
- [ ] Run total displays "X.Xk / XXXk" with correct percentage
- [ ] Per-task mini bar appears for T001 showing budget vs actual
- [ ] T001's bar color reflects usage percentage:
  - Green (#4ade80) if 0-60%
  - Yellow (#fbbf24) if 60-85%
  - Orange (#f97316) if 85-100%
  - Red (#ef4444) if over 100%
- [ ] Token breakdown section shows input vs output token split for T001

**Progress tracking:**
- [ ] Stats row updates to "1/{TOTAL_TASKS} tasks" completed
- [ ] Progress bar updates to reflect completion percentage
- [ ] Current wave updates to "2" (next wave ready)

**Events log:**
- [ ] Events section shows T001 completion entry with token count and duration
- [ ] Entry format includes timestamp, task ID, and token summary (e.g., "14:03 T001 done (20.6k tokens, 2m39s)")
- [ ] Dispatch entry for T001 is also visible

---

## Step 4: During Wave 2 (Parallel Execution)

Wave 2 contains multiple tasks (T002, T003, T004) dispatched in parallel. The dashboard must show concurrent running states.

### Expected Behavior

1. Dispatcher identifies T002, T003, T004 as ready and dispatches up to `max_parallel` (3) simultaneously.
2. Dashboard server detects task status changes to `running`.
3. All three tasks show as actively running in the dashboard.

### Validations

**Concurrent running indicators:**
- [ ] Multiple tasks (up to 3) show the pulsing purple dot indicator simultaneously
- [ ] Each running task displays "running..." text
- [ ] Wave 2 header shows status "Running"

**Wave visual hierarchy:**
- [ ] Wave 1 appears as completed (green/dimmed, collapsed or compacted)
- [ ] Wave 2 appears as active with highlighted border
- [ ] Waves 3+ appear as pending/dimmed (future waves not yet ready)

**Events log:**
- [ ] Events section shows dispatch entries for Wave 2 tasks
- [ ] Entry format: "14:05 T002, T003, T004 dispatched (wave 2)" or individual dispatch entries
- [ ] Checkpoint approval entry visible (if autonomy=checkpoint)

**As individual tasks complete:**
- [ ] When T002 finishes first, its indicator changes to green checkmark while T003/T004 remain pulsing
- [ ] Token data for T002 appears in the per-task mini bar immediately
- [ ] `token-usage.json` updates incrementally as each task completes
- [ ] `run_total` accumulates correctly (T001 + T002 totals, then +T003, then +T004)
- [ ] Progress bar updates incrementally as each task finishes

---

## Step 5: After Failure + Retry (If Occurs)

If any task fails during the run, the dashboard must reflect the failure, retry attempt, and eventual resolution.

### Expected Behavior

1. Sub-agent returns a failure (soft_failure or hard_failure).
2. Result Collector records the failure.
3. Dashboard shows failure state.
4. Automatic retry is scheduled (checkpoint mode allows one auto-retry).
5. Retry dispatches and either succeeds or triggers a checkpoint pause.

### Validations

**Failure display:**
- [ ] Failed task shows red X indicator
- [ ] Failed task row shows "failed" text with a brief error reason
- [ ] Failed task's wave header does NOT show "Complete" while the failure is unresolved
- [ ] Dependent tasks remain "pending" (not unlocked)

**Events log during failure:**
- [ ] Events section shows failure entry with outcome type (e.g., "T005 failed (soft_failure)")
- [ ] Events section shows retry scheduling entry (e.g., "T005 — scheduling retry 1/2")
- [ ] Events section shows retry dispatch entry

**Token tracking for retried tasks:**
- [ ] After retry succeeds, `token-usage.json` entry reflects the final successful attempt's token data
- [ ] `retries` field in the task's token entry records the retry count (e.g., `1`)
- [ ] `run_total` accounts for all token usage including the failed attempt(s)
- [ ] `budget_used_pct` reflects cumulative token usage across attempts (may exceed 100% if retries consumed significant tokens)

**Dashboard updates during retry:**
- [ ] Task transitions from red X (failed) back to pulsing purple (running) when retry dispatches
- [ ] If retry succeeds, task transitions from pulsing purple to green checkmark
- [ ] Events log shows the complete failure-retry-success sequence chronologically

---

## Step 6: Completion

After all waves complete and all tasks reach `done`, the dashboard shows the final state and the server shuts down.

### Expected Behavior

1. Dispatcher's completion check triggers: all tasks are `done`.
2. Final state is written to `.orchestra/` files.
3. Dashboard server detects the final state update and pushes the last SSE snapshot.
4. `stop-dashboard.sh` is called.
5. Dashboard remains viewable in the browser (shows final state).

### Validations

**Task list final state:**
- [ ] All tasks show green checkmark indicators
- [ ] All wave headers show "Complete" status
- [ ] No tasks in "pending", "ready", or "running" state

**Progress tracking:**
- [ ] Progress bar shows 100% completion
- [ ] Stats row shows "{TOTAL}/{TOTAL} tasks" completed
- [ ] Elapsed time shows the total run duration

**Token totals accuracy:**
- [ ] `token-usage.json` has entries for every task
- [ ] `run_total.total_tokens` equals the sum of all `tasks.{ID}.total_tokens`
- [ ] `run_total.input_tokens` equals the sum of all `tasks.{ID}.input_tokens`
- [ ] `run_total.output_tokens` equals the sum of all `tasks.{ID}.output_tokens`
- [ ] `run_total.total_budget` equals the sum of all task budgets (from task file frontmatter)
- [ ] Each task's `budget_used_pct` is correctly computed: `(total_tokens / budget) * 100`

**Dashboard token panel final state:**
- [ ] Run total progress bar shows final percentage
- [ ] Per-task mini bars are populated for every task
- [ ] Token breakdown shows the aggregate input vs output token split
- [ ] Bar colors correctly reflect each task's budget usage (green/yellow/orange/red thresholds)

**Events log:**
- [ ] Events section shows the full chronological run history (last 20 entries)
- [ ] Final completion entry is visible (e.g., "Run complete — all tasks done")
- [ ] Wave transition entries and checkpoint approvals are present

**Server shutdown:**
- [ ] `scripts/stop-dashboard.sh` is called after the final summary is presented
- [ ] Dashboard server process is no longer running
- [ ] The browser dashboard remains viewable (last rendered state, no live updates)
- [ ] Connection status indicator changes to red ("Disconnected") after server stops
- [ ] The dashboard does not crash or show errors — it gracefully handles the lost SSE connection

---

## Success Criteria — Core Validation

These invariants must hold across the entire dashboard and token tracking flow. Failure of any item indicates a fundamental issue.

### 1. Dashboard responsiveness

- [ ] Dashboard updates within ~200ms of a state change in `.orchestra/` (100ms debounce + parse + SSE push + browser render)
- [ ] No perceptible lag between a task status change on disk and the UI reflecting it
- [ ] File change debouncing at 100ms prevents event flooding during rapid writes (e.g., multiple task files updated in quick succession)

### 2. SSE reliability

- [ ] SSE connection reconnects automatically on connection drop (built-in `EventSource` behavior)
- [ ] After reconnection, the server sends a full state snapshot so the browser is immediately up to date
- [ ] Keepalive comments every 15 seconds prevent proxy/browser connection timeout
- [ ] No duplicate events or missed state changes during normal operation
- [ ] Multiple browser tabs can connect to `/events` simultaneously and each receives updates

### 3. Token accuracy

- [ ] Token percentages match: `budget_used_pct == (total_tokens / budget) * 100` for every task
- [ ] Run total is always the exact sum of individual task totals (no drift or rounding errors in accumulation)
- [ ] Input + output tokens equal total tokens for every entry
- [ ] Token data survives resume: if the run is paused and resumed, existing `token-usage.json` data is preserved and new data is appended
- [ ] `total_budget` is recalculated from task files on resume (accounts for any task edits during pause)

### 4. Cross-platform compatibility

- [ ] Dashboard works on macOS (nohup + disown server launch)
- [ ] Dashboard works on Linux (nohup + disown server launch)
- [ ] Dashboard works on Windows via Git Bash (foreground mode with `run_in_background: true`)
- [ ] Dashboard works in Codex environment (foreground mode, `$CODEX_CI` detected)
- [ ] `dashboard.html` renders correctly in Chrome, Firefox, and Safari
- [ ] `fs.watch` behavior is handled per platform (macOS has different fs.watch semantics than Linux)

### 5. Zero external dependencies

- [ ] `dashboard-server.cjs` uses only Node.js built-in modules (`http`, `fs`, `path`)
- [ ] `dashboard.html` uses no external CSS or JavaScript libraries
- [ ] No `npm install` required — the dashboard is fully self-contained
- [ ] `EventSource` is used natively in the browser (no polyfills)
- [ ] Shell scripts (`start-dashboard.sh`, `stop-dashboard.sh`) use only standard POSIX utilities (plus platform detection for Windows)

### 6. Server lifecycle

- [ ] Server starts during initialization and stops at completion/abort
- [ ] 30-minute idle timeout auto-exits the server if no `.orchestra/` file changes are detected
- [ ] Owner PID monitoring exits the server if the Claude Code process dies
- [ ] On resume, a new server instance starts and reads existing state from disk
- [ ] No orphan server processes after run completion, abort, or crash

### 7. Read-only guarantee

- [ ] The dashboard does not accept any user input via the browser
- [ ] No data flows from browser back to server (no POST/PUT/DELETE endpoints)
- [ ] The dashboard does not write to `.orchestra/` — it is strictly a reader
- [ ] All run control remains in the terminal (start, stop, checkpoint approvals, abort)
