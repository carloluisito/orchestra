# Scenario: Session Resume

## Overview

This scenario validates the `/orchestra resume` flow — recovering from a session interruption mid-run and continuing execution from the correct point.

## Setup

### Prerequisites

1. Complete the **Rich Input** scenario (`scenario-rich-input.md`) through the decomposition step so that a fully populated `.orchestra/` directory exists with 10-13 tasks across 4-5 waves.
2. Execute the dispatch loop until **Wave 2 is in progress** — at least one Wave 2 task has been dispatched and is `status: running`, and all Wave 1 tasks are `status: done`.

### Simulating Session Interruption

After Wave 2 dispatch begins:

1. Verify the following state exists on disk:
   - `.orchestra/config.md` with `status: running`.
   - At least 1 task file with `status: done` (Wave 1 tasks).
   - At least 1 task file with `status: running` (dispatched Wave 2 tasks).
   - Remaining task files with `status: pending`.
   - `.orchestra/history.md` contains dispatch entries for Wave 1 tasks (completed) and Wave 2 tasks (dispatched).
   - `.orchestra/results/` contains result logs for completed Wave 1 tasks.

2. **Terminate the session.** Close the terminal, kill the process, or otherwise interrupt execution without allowing graceful shutdown. This leaves tasks in `status: running` on disk even though no agent is actively working on them.

3. **Optionally simulate partial work.** For one of the `running` tasks, create or modify one of its `relevant_files` to simulate an agent that produced partial output before interruption. For another `running` task, leave its relevant files untouched (agent had not yet written anything).

### Starting the Resume

4. Open a new session (fresh terminal, fresh Claude Code invocation).
5. Run `/orchestra resume`.

---

## Expected Behavior

### Step 1: Detect Existing Run

The Resume flow should:
- Detect that `.orchestra/` exists.
- Proceed to read state (not report "no active run").

### Step 2: Read State (State Manager Operation 2)

The State Manager reads and parses the full run state:

1. **config.md** — Extract project name, creation timestamp, `status: running`, and all settings (token_budget, autonomy, max_retries, etc.).

2. **dag.md** — Parse the task table and wave list. Extract `total_tasks`, `completed`, `failed` counters.

3. **Task file scan** — Read all `.orchestra/tasks/*.md` files. Build the status map:
   - Wave 1 tasks: `status: done`
   - Dispatched Wave 2 tasks: `status: running` (stale — no agent is actually running)
   - Remaining tasks: `status: pending`

4. **Interrupted task handling** — For each task with `status: running`:
   - **Task with partial work on disk:** The State Manager checks if the task's listed `files_changed` or `relevant_files` contain modifications (using `git diff` or file timestamps). If the simulated partial work is detected, the State Manager should assess whether the work appears complete or incomplete. Since it is partial, the task should be **reset to `ready`** with a note: `> Resumed: reset to ready — previous attempt was interrupted.`
   - **Task with no work on disk:** The State Manager detects no file modifications. The task is **reset to `ready`** with the same note.
   - In both cases, an entry is appended to `history.md` documenting the recovery action.

5. **history.md tail** — The last 20 lines are read for context, showing the most recent activity before interruption.

6. **Progress computation** — Status counts are calculated:
   - `done`: count of completed Wave 1 tasks
   - `failed`: 0
   - `running`: 0 (after step 4 resets)
   - `ready`: count of recovered Wave 2 tasks (reset from running)
   - `pending`: count of Wave 3+ tasks

### Step 3: Present Status

The user should see:

```
Orchestra: {PROJECT_NAME}
Progress: {COMPLETED}/{TOTAL} tasks (0 failed)
Current wave: 2

| Status  | Tasks                     |
|---------|---------------------------|
| Done    | T001, ...                 |
| Running | (none)                    |
| Ready   | T002, T003, T004, ...     |
| Pending | T005, T006, ...           |
| Failed  | (none)                    |

Next: {N} ready to dispatch.
```

Key details in the presentation:
- **Completed tasks** accurately reflect only Wave 1 tasks that finished before interruption.
- **Running tasks** show `(none)` — all previously running tasks have been reset.
- **Ready tasks** include the recovered Wave 2 tasks that were reset from `running` to `ready`.
- **Pending tasks** include all Wave 3+ tasks whose dependencies are not yet met.
- The **current wave** is correctly identified as Wave 2.

Additionally, the last 5 entries from `history.md` should be displayed, including the recovery notes from interrupted task handling.

### Step 4: Confirm and Continue

The system asks: "Resume execution?"

- If the user confirms, the Dispatcher enters the execution loop starting at **Step 1: Read Current State**.
- The Dispatcher should identify the `ready` tasks (recovered Wave 2 tasks) and proceed through the autonomy gate.
- Since `autonomy: checkpoint` and this is resuming Wave 2 (same wave as before interruption), the checkpoint gate may or may not trigger depending on whether it considers this a "new wave." The expected behavior is that it presents the Wave 2 plan since this is a new session.
- Dispatch proceeds normally from the recovered state.

---

## Expected State Changes

### history.md After Resume

The history file should gain these new entries (appended, never overwritten):

```
- [{TIME}] Session resumed. Reading state from .orchestra/.
- [{TIME}] {TASK_ID_A} — Resumed: reset to ready — previous attempt was interrupted.
- [{TIME}] {TASK_ID_B} — Resumed: reset to ready — previous attempt was interrupted.
```

If execution continues after resume confirmation, additional dispatch entries follow:

```
- [{TIME}] {TASK_ID_A} ({TITLE}) — dispatched to sub-agent. Model: sonnet. Wave: 2.
- [{TIME}] {TASK_ID_B} ({TITLE}) — dispatched to sub-agent. Model: sonnet. Wave: 2.
```

### Task Files After Resume

Each recovered task file should contain:
- `status: ready` (reset from `running`)
- A blockquote note in the body: `> Resumed: reset to ready — previous attempt was interrupted.`
- The original objective, acceptance criteria, and context pointers are preserved (no data loss).

### dag.md After Resume

- The task table reflects updated statuses: Wave 1 tasks `done`, recovered Wave 2 tasks `ready`, others `pending`.
- Frontmatter counters are accurate: `completed` matches done count, `failed` is 0.
- Wave list is unchanged (wave assignments are structural, not affected by resume).

---

## Edge Cases to Verify

### Edge Case 1: Task With Complete Work Detected

If the State Manager determines that a `running` task's work is actually complete (all relevant files exist with expected content, acceptance criteria appear met):
- The task should be marked `done` instead of `ready`.
- A different note should appear: `> Resumed: marked done — work from previous session detected.`
- The Result section should be populated with available information.
- Dependent tasks should be unlocked if all their dependencies are now `done`.

### Edge Case 2: No Running Tasks

If the session was interrupted after all dispatched tasks completed but before the next wave was dispatched (i.e., all tasks are either `done` or `pending`, none are `running`):
- The State Manager should not attempt interrupted task recovery (no `running` tasks to process).
- The resume should correctly identify which tasks are `ready` by checking dependency satisfaction.
- The presentation should show the correct current wave.

### Edge Case 3: Multiple Waves Partially Complete

If tasks from both Wave 2 and Wave 3 were dispatched before interruption (possible if Wave 2 tasks completed quickly and Wave 3 was started):
- All `running` tasks from both waves should be recovered.
- The current wave should be the lowest wave with non-done tasks.
- Ready tasks from both waves should be presented.

---

## Validation Checklist

### Run Detection
- [ ] `/orchestra resume` detects `.orchestra/` directory exists
- [ ] No "no active run" error is shown
- [ ] State Manager Operation 2 is invoked

### State Reading
- [ ] `config.md` is read and parsed correctly
- [ ] `dag.md` is read and parsed correctly
- [ ] All task files in `.orchestra/tasks/` are scanned
- [ ] Status map is built accurately (done, running, pending counts match)

### Interrupted Task Recovery
- [ ] Tasks with `status: running` are detected
- [ ] File system is checked for completed work (git diff or file timestamps)
- [ ] Tasks with no completed work are reset to `ready`
- [ ] Tasks with partial work are reset to `ready` (unless work appears fully complete)
- [ ] Recovery notes are appended to task files as blockquotes
- [ ] Recovery actions are logged in `history.md`
- [ ] No task remains in `status: running` after recovery

### History Integrity
- [ ] `history.md` is append-only (previous entries preserved)
- [ ] New session is recorded in history
- [ ] Each recovery action has a timestamped entry
- [ ] Previous session's entries are still present and readable

### Status Presentation
- [ ] Completed task count is accurate (only truly finished tasks)
- [ ] No tasks show as `running` (all recovered)
- [ ] Ready tasks are correctly identified (recovered + newly unlocked)
- [ ] Pending tasks are correctly identified (dependencies not yet met)
- [ ] Current wave number is accurate
- [ ] Last 5 history entries are displayed
- [ ] Progress fraction (e.g., "3/12 tasks") is correct

### Dispatch Resumption
- [ ] After user confirms resume, Dispatcher enters execution loop
- [ ] Dispatcher reads fresh state from disk (Step 1)
- [ ] Ready tasks are found and queued for dispatch
- [ ] Autonomy gate is applied correctly for the resumed wave
- [ ] Tasks are dispatched starting from the correct wave (not restarting from Wave 1)
- [ ] Previously completed tasks are NOT re-dispatched
- [ ] Sub-agent prompts include upstream summaries from tasks completed before interruption

### Data Integrity
- [ ] No task files are deleted or corrupted during resume
- [ ] No result logs from completed tasks are lost
- [ ] Task objectives and acceptance criteria are preserved through recovery
- [ ] Config settings are unchanged by resume
- [ ] DAG wave assignments are unchanged by resume
- [ ] Dependency edges are unchanged by resume
