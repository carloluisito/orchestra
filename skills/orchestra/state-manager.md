# State Manager

You are the persistence layer for Orchestra. Every read and write to the `.orchestra/` directory goes through the operations defined here. Follow these instructions exactly when performing state operations.

---

## Directory Structure

A fully initialized `.orchestra/` directory contains:

```
.orchestra/
  config.md            # Run configuration (from config-template.md)
  dag.md               # Task dependency graph and progress (from dag-template.md)
  history.md           # Append-only run log (from history-template.md)
  token-usage.json     # Token tracking data (JSON, machine-readable)
  dashboard-info.json  # Dashboard server URL and port (written by start-dashboard.sh)
  input/               # Original input source (spec, prompt, URL content)
  tasks/               # One file per task: T001.md, T002.md, etc.
  results/             # Full output artifacts from completed tasks
```

---

## Operation 1: Initialize a New Run

Trigger: The user starts a new orchestration run (no existing `.orchestra/` directory, or user explicitly requests a fresh run).

### Steps

1. **Create the directory structure.** Run:
   ```
   mkdir -p .orchestra/input .orchestra/tasks .orchestra/results
   ```

2. **Generate `config.md`** from `skills/orchestra/templates/config-template.md`. Substitute these variables:
   - `{{PROJECT_NAME}}` — infer from the current directory name (the basename of `pwd`).
   - `{{TIMESTAMP}}` — current ISO 8601 timestamp (e.g., `2026-04-14T09:30:00Z`).
   - `{{TOKEN_BUDGET}}` — use the user-provided value, or default to `80000`.
   - `{{AUTONOMY}}` — use the user-provided value, or default to `checkpoint`.
   - `{{MAX_RETRIES}}` — use the user-provided value, or default to `2`.
   - `{{MAX_PARALLEL}}` — use the user-provided value, or default to `3`.
   - `{{FALLBACK_MODE}}` — use the user-provided value, or default to `auto`.
   - `{{AGENT_MODEL}}` — use the user-provided value, or default to `sonnet`.
   - `{{AGENT_TYPE}}` — use the user-provided value, or default to `general-purpose`.
   - `{{USE_WORKTREES}}` — use the user-provided value, or default to `true`.
   - `{{BRANCH_NAME}}` — use the branch name from Step 2b.
   - `{{BRANCH_BASE}}` — use the base branch from Step 2b, or default to `main`.
   - `{{PRIMARY_REPO}}` — infer from the current directory name (the basename of `pwd`). Same value as `{{PROJECT_NAME}}`.
   - `{{REGISTERED_REPOS}}` — if `--repos` was provided, generate a YAML-style list:
     ```
     registered_repos:
       - name: {repo_name}
         path: ../{repo_name}
         branch_base: {per_repo_base_or_default}
     ```
     If no `--repos` was provided, substitute with an empty string (omit the section entirely).
   - `{{CONVENTIONS_COLLECTED}}` — use `true` if Step 2d collected conventions, or `false` if no convention sources were found.

   Write the result to `.orchestra/config.md`.

3. **Record the input source.** Copy or write the user's input into `.orchestra/input/`:
   - If the input is a file path: copy the file into `.orchestra/input/`.
   - If the input is inline text or a prompt: write it to `.orchestra/input/prompt.md`.
   - If the input is a URL: fetch the content and save it to `.orchestra/input/source.md`, noting the original URL at the top.

3b. **Record stashed repos (if any).** If any repos were auto-stashed during Step 2c of the run flow, record them so the completion summary can remind the user. Append to `config.md`:
   ```
   ## Stashed Repos
   stashed_repos: [{comma-separated list of repo names that were stashed}]
   ```
   If no repos were stashed, omit this section.

4. **Generate `history.md`** from `skills/orchestra/templates/history-template.md`. Substitute:
   - `{{PROJECT_NAME}}` — same value as config.
   - `{{TIMESTAMP}}` — same value as config.
   - `{{INPUT_SOURCE}}` — a short description of the input (filename, "inline prompt", or URL).
   - `{{TIME}}` — current time in `HH:MM` format.
   - `{{TOTAL_TASKS}}` — write `0` for now (the Decomposer will update this).

   Write the result to `.orchestra/history.md`.

5. **Create empty token usage file.** Write `.orchestra/token-usage.json`:
   ```json
   {
     "run_total": {
       "input_tokens": 0,
       "output_tokens": 0,
       "total_tokens": 0,
       "total_budget": 0
     },
     "tasks": {},
     "calibration": {
       "ratio": 1.0,
       "sample_size": 0,
       "recent_tasks": []
     }
   }
   ```

6. **Create empty placeholder files.** Write the dag-template.md header to `.orchestra/dag.md` with `{{TOTAL_TASKS}}` set to `0` and `{{TASK_ROWS}}` and `{{WAVE_LIST}}` left empty. This signals that decomposition has not yet occurred.

7. **Do NOT populate `tasks/`.** The Decomposer is responsible for creating task files and updating the DAG.

### Validation

After initialization, confirm all these paths exist:
- `.orchestra/config.md`
- `.orchestra/dag.md`
- `.orchestra/history.md`
- `.orchestra/token-usage.json`
- `.orchestra/input/` (with at least one file inside)
- `.orchestra/tasks/` (empty directory)
- `.orchestra/results/` (empty directory)

If any are missing, report the error and retry the failed step.

---

## Operation 2: Read State for Resume

Trigger: The user resumes an existing run (`.orchestra/` directory already exists).

### Steps

1. **Read and parse `config.md`.** Extract the frontmatter block (between `---` delimiters):
   - `project` — the project name.
   - `created` — when the run was initialized.
   - `status` — one of: `pending`, `running`, `paused`, `done`, `failed`.

   Also read the body for settings: `token_budget`, `autonomy`, `max_retries`, `max_parallel`, `fallback_mode`, `agent_model`, `agent_type`, `use_worktrees`.

2. **Read and parse `dag.md`.** Extract frontmatter counters:
   - `total_tasks`, `completed`, `failed`, `status`.

   Parse the task table for an overview of all task IDs, titles, dependencies, and statuses.

3. **Scan `tasks/*.md`.** For each task file:
   - Read the frontmatter to extract: `id`, `title`, `status`, `depends_on`, `blocks`, `priority`.
   - Build an in-memory map of task ID to status.

4. **Handle interrupted tasks.** For any task with `status: running`:
   - Check if the task's listed `files_changed` actually contain modifications (use `git diff` or file timestamps).
   - If the work appears complete (files changed, acceptance criteria met): update the task status to `done` and populate the Result section. Append a note: `> Resumed: marked done — work from previous session detected.`
   - If the work appears incomplete or unclear: reset the task status to `ready`. Append a note: `> Resumed: reset to ready — previous attempt was interrupted.`
   - In either case, append an entry to `history.md` documenting the recovery action.

5. **Read the tail of `history.md`.** Read the last 20 lines to understand recent activity and provide context for the current session.

6. **Compute progress.** Count tasks by status:
   - `done` — completed successfully.
   - `failed` — attempted and failed.
   - `running` — currently being executed (should be 0 after step 4).
   - `ready` — all dependencies met, waiting for dispatch.
   - `pending` — dependencies not yet met.

   Store these counts for use in status presentation.

7. **Read token usage.** If `.orchestra/token-usage.json` exists, read it for current token totals. If it doesn't exist (run started before token tracking was added), create it with the empty structure from Operation 1 and backfill from completed task results if available.

   - **Validate registered repos.** If `config.md` contains a `registered_repos` section, verify each repo path still exists and is a git repository. If any repo is missing, warn the user: "Registered repository `{name}` at `{path}` is no longer accessible. This may affect tasks targeting that repo." Do not abort — let the user decide whether to continue.

### Output

Return a structured summary containing:
- Project name and overall status.
- Progress counts (done/failed/running/ready/pending).
- List of tasks that are `ready` for immediate dispatch.
- The last 20 lines of history for context.

---

## Operation 3: Update Task Status

Trigger: A task has completed, failed, or needs a status change.

### Steps

1. **Read the task file.** Open `.orchestra/tasks/{TASK_ID}.md` and parse its full content.

2. **Update the frontmatter status.** Change the `status` field to the new value. Valid transitions:
   - `pending` -> `ready` (when dependencies are met — handled by Operation 4)
   - `ready` -> `running` (when dispatched to an agent)
   - `running` -> `done` (when completed successfully)
   - `running` -> `failed` (when the agent reports failure)
   - `failed` -> `ready` (when retrying)

3. **Populate the Result section based on the new status:**

   If `done`:
   ```
   ## Result
   summary: <one-line description of what was accomplished>
   files_changed: <comma-separated list of files created or modified>
   full_output: .orchestra/results/{TASK_ID}.md
   ```
   Also write the agent's full output to `.orchestra/results/{TASK_ID}.md`.

   If `failed`:
   ```
   ## Result
   summary: FAILED — <one-line description of the failure>
   files_changed: <any partial changes, or "none">
   full_output: .orchestra/results/{TASK_ID}.md
   ```
   Also write the agent's full output (including error details) to `.orchestra/results/{TASK_ID}.md`.

4. **Write the updated task file** back to `.orchestra/tasks/{TASK_ID}.md`.

5. **Update `dag.md`.** Regenerate the task table by reading all task files and rebuilding the table rows and frontmatter counters. See Operation 4 for the full procedure.

6. **Append to `history.md`.** Add a timestamped entry:
   ```
   - [{TIME}] {TASK_ID} ({TITLE}) — status changed to {NEW_STATUS}. {BRIEF_REASON}
   ```

---

## Operation 4: Update DAG After Status Changes

Trigger: After any task status change, or when explicitly asked to refresh the DAG.

### Steps

1. **Read all task files.** Scan `.orchestra/tasks/*.md` and parse each file's frontmatter for `id`, `title`, `depends_on`, and `status`.

2. **Propagate readiness.** For each task with `status: pending`:
   - Look up all tasks listed in its `depends_on` array.
   - If every dependency has `status: done`, change this task's status to `ready`.
   - Write the updated frontmatter back to the task file.
   - Append to `history.md`: `- [{TIME}] {TASK_ID} — unlocked (dependencies met), status changed to ready.`

3. **Regenerate the task table in `dag.md`.** Build the table from current task data:
   ```
   | ID    | Title              | Depends On  | Status  |
   |-------|--------------------|-------------|---------|
   | T001  | Set up project     | —           | done    |
   | T002  | Implement feature  | T001        | ready   |
   | T003  | Write tests        | T001, T002  | pending |
   ```
   Use `—` for tasks with no dependencies. Join multiple dependencies with `, `.

4. **Regenerate the wave list.** Group tasks into waves based on dependency depth:
   - **Wave 1:** Tasks with no dependencies (empty `depends_on`).
   - **Wave 2:** Tasks whose dependencies are all in Wave 1.
   - **Wave N:** Tasks whose dependencies are all in Waves 1 through N-1.

   Format:
   ```
   ## Waves
   - Wave 1: T001, T004
   - Wave 2: T002, T005, T006
   - Wave 3: T003, T007
   ```

5. **Update `dag.md` frontmatter counters.** Recompute and write:
   - `total_tasks` — total number of task files.
   - `completed` — count of tasks with `status: done`.
   - `failed` — count of tasks with `status: failed`.
   - `status` — overall status:
     - `done` if all tasks are `done`.
     - `failed` if any task is `failed` and retries are exhausted.
     - `running` if any task is `running` or `ready`.
     - `pending` if all tasks are `pending` (decomposition just happened).

6. **Write the updated `dag.md`** to disk.

---

## Operation 5: Status Presentation

Trigger: When the user asks for progress, or at checkpoint moments between waves.

### Steps

1. **Read current state.** Run Operation 2 (Read State for Resume) steps 1-3 and 6 to gather current data. If you already have current data in memory from a recent operation, you may skip re-reading.

2. **Format the progress report.** Use this exact template:

   ```
   Orchestra: {PROJECT_NAME}
   Progress: {COMPLETED}/{TOTAL} tasks ({FAILED} failed)
   Current wave: {WAVE_NUMBER}

   | Status  | Tasks            |
   |---------|------------------|
   | Done    | T001, T002       |
   | Running | T003             |
   | Ready   | T005, T006       |
   | Pending | T007, T008       |
   | Failed  | (none)           |

   Next: {READY_COUNT} ready to dispatch.
   ```

   Where:
   - `{PROJECT_NAME}` — from config.md.
   - `{COMPLETED}` — count of `done` tasks.
   - `{TOTAL}` — total task count.
   - `{FAILED}` — count of `failed` tasks.
   - `{WAVE_NUMBER}` — the current wave (the lowest wave number that still has non-done tasks).
   - Task IDs are listed comma-separated within each status row.
   - If no tasks have a given status, show `(none)`.
   - `{READY_COUNT}` — number of tasks with `status: ready`.

3. **Present to the user.** Display the formatted report. If there are failed tasks, add a note below the table:
   ```
   Warning: {FAILED} task(s) failed. Review .orchestra/results/{TASK_ID}.md for details.
   ```

---

## Operation 6: Update Config Status

Trigger: When the overall run status changes (e.g., all tasks done, a fatal failure, user pauses).

### Steps

1. **Read `config.md`.**
2. **Update the `status` field** in frontmatter to the new value: `running`, `paused`, `done`, or `failed`.
3. **Write the updated `config.md`.**
4. **Append to `history.md`:**
   ```
   - [{TIME}] Run status changed to {NEW_STATUS}.
   ```

---

## Error Handling

Apply these rules across all operations:

- **File not found:** If a required file is missing (e.g., a task file referenced in dag.md), log a warning to `history.md` and continue with available data. Do not crash the run.
- **Parse errors:** If frontmatter cannot be parsed, report the file path and the raw content of the first 10 lines. Ask the user whether to attempt repair or skip.
- **Concurrent writes:** Orchestra tasks run one at a time from the orchestrator's perspective. If you detect an unexpected file modification timestamp, log it to `history.md` and re-read before writing.
- **Disk full / permission errors:** Report the error immediately to the user. Do not retry automatically.

---

## Key Principles

1. **`.orchestra/` is the single source of truth.** Never rely on in-memory state alone. Always read from disk before making decisions, and write back immediately after changes.
2. **Append-only history.** Never delete or overwrite lines in `history.md`. Only append new entries.
3. **Atomic updates.** When updating a task file, read the whole file, modify in memory, then write the whole file back. Do not do partial writes.
4. **Consistent DAG.** After any task status change, always run Operation 4 to keep `dag.md` synchronized with the individual task files.
5. **Templates are read-only.** Never modify files in `skills/orchestra/templates/`. Always read them as source and write generated files to `.orchestra/`.
