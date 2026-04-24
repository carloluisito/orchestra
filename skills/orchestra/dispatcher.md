# Dispatcher

You are the main execution engine for Orchestra. You drive the execution loop: reading state, identifying ready tasks, enforcing autonomy gates, dispatching sub-agents, and collecting results. Follow these instructions exactly, looping until all tasks are complete or the run is halted.

---

## Execution Loop

Repeat Steps 1 through 9 until all tasks reach `done` or the run is halted by failure or user decision.

---

### Step 1: Read Current State

Read the Orchestra state from disk. Do not rely on in-memory state from previous iterations — always re-read.

1. **Read `.orchestra/config.md`.** Parse the frontmatter and body. Extract these settings for use throughout the loop:
   - `autonomy` — one of: `full_auto`, `checkpoint`, `per_task`.
   - `max_parallel` — maximum number of concurrent sub-agents.
   - `agent_model` — model to use for sub-agents (e.g., `sonnet`).
   - `agent_type` — agent type (e.g., `general-purpose`).
   - `use_worktrees` — whether to give each agent a git worktree for isolation.
   - `max_retries` — maximum retry attempts per task.
   - `token_budget` — default token budget for tasks.

2. **Read all task files.** Scan `.orchestra/tasks/*.md`. For each task, parse the frontmatter and extract: `id`, `title`, `status`, `depends_on`, `blocks`, `priority`, `autonomy`, `token_budget`.

3. **Read `.orchestra/dag.md`.** Parse the wave list to understand which wave is current. The current wave is the lowest-numbered wave that still contains tasks with status other than `done`.

4. **Build the task status map.** Create an in-memory map of task ID to status for quick lookup in subsequent steps.

---

### Step 2: Find Ready Tasks

Determine which tasks are eligible for dispatch.

1. **Scan for newly ready tasks.** For each task with `status: pending`:
   - Look up every task ID in its `depends_on` list using the status map.
   - If every dependency has `status: done`, this task is now ready.
   - Update the task's status from `pending` to `ready` by writing the updated frontmatter to its task file.
   - Append to `.orchestra/history.md`: `- [{TIME}] {TASK_ID} — unlocked (dependencies met), status changed to ready.`

2. **Collect the current wave.** Gather all tasks with `status: ready` into a list called `current_wave`. Sort by priority (`high` first, then `medium`, then `low`).

3. **Note running tasks.** Also collect all tasks with `status: running` into a separate list. These are agents from a previous dispatch that have not yet returned (relevant only if using parallelism across loop iterations).

---

### Step 3: Check Completion

Evaluate whether the run is finished, blocked, or should continue.

**Condition A — All done:**
If `current_wave` is empty AND every task in the status map has `status: done`:
1. Read `.orchestra/config.md` and update the `status` field to `done`.
2. Follow State Manager Operation 5 (Status Presentation) to display the final progress report.
3. Append to `.orchestra/history.md`: `- [{TIME}] Run complete — all tasks done.`
4. **Stop the loop. The run is finished.**

**Condition B — Blocked by failures:**
If `current_wave` is empty AND no tasks are `running` AND there are tasks with `status: failed` that have dependents still `pending`:
1. Identify the failed tasks and the pending tasks they block.
2. Present the situation to the user:
   ```
   Blocked: {N} task(s) failed, blocking {M} dependent task(s).

   Failed tasks:
   - {TASK_ID} ({TITLE}): {failure summary from Result section}

   Blocked tasks:
   - {TASK_ID} ({TITLE}): waiting on {DEPENDENCY_IDS}

   Options:
   1. retry — Retry the failed task(s) with enriched context
   2. skip  — Mark failed task(s) as done (skipped) and unlock dependents
   3. abort — Stop the run entirely
   ```
3. Wait for the user's choice:
   - **retry**: Reset the failed task's status to `ready`. Increment its retry counter. Return to Step 1.
   - **skip**: Set the failed task's status to `done`. Add a note in its Result section: `summary: SKIPPED — marked done by user to unblock dependents.` Run State Manager Operation 4 to propagate readiness. Return to Step 1.
   - **abort**: Update config status to `failed`. Append to history: `- [{TIME}] Run aborted by user.` **Stop the loop.**

**Condition C — Waiting:**
If `current_wave` is empty AND there are tasks with `status: running`:
1. Wait for the running agents to return. Do not dispatch new tasks.
2. When agents return, proceed to Step 7 (Collect Results) for each.

**Condition D — Ready to proceed:**
If `current_wave` is not empty, continue to Step 4.

---

### Step 4: Autonomy Gate

Before dispatching, check whether the user needs to approve the next batch. The behavior depends on the `autonomy` setting from config and any per-task overrides.

#### Mode: `full_auto`

Skip this step entirely. Proceed directly to Step 5.

#### Mode: `checkpoint`

If this is a **new wave** (the current wave number is higher than the last dispatched wave):

1. Present the results of the previous wave (if any):
   ```
   Wave {N-1} complete:
   - {TASK_ID} ({TITLE}): {outcome} — {one-line summary}
   - {TASK_ID} ({TITLE}): {outcome} — {one-line summary}
   ```

2. Present the plan for the next wave:
   ```
   Wave {N} ready ({COUNT} tasks):
   - {TASK_ID} ({TITLE}): {objective} [budget: {token_budget} tokens]
   - {TASK_ID} ({TITLE}): {objective} [budget: {token_budget} tokens]

   Proceed? (yes / edit / abort)
   ```

3. Wait for the user's response:
   - **yes**: Continue to Step 5.
   - **edit**: Allow the user to modify task objectives, budgets, or skip specific tasks. Apply edits, then re-present and re-confirm.
   - **abort**: Update config status to `paused`. Append to history: `- [{TIME}] Run paused by user at wave {N}.` **Stop the loop.**

If this is the **same wave** (continuing after a retry or after some tasks in the wave completed), do not pause. Proceed to Step 5.

#### Mode: `per_task`

For **each task** in `current_wave`, present it individually for approval:

1. Check the task's own `autonomy` field. If the task has a per-task autonomy override:
   - If the task's `autonomy` field is empty or matches the global setting, apply `per_task` behavior (present for approval).
   - If the task's `autonomy` field is `full_auto`, skip approval for this specific task.

2. For tasks requiring approval, present:
   ```
   Task {TASK_ID}: {TITLE}
   Objective: {objective}
   Token budget: {token_budget}
   Dependencies: {depends_on list, or "none"}
   Priority: {priority}

   Prompt preview (first 500 chars):
   {first 500 characters of the assembled prompt from Step 5}

   Dispatch this task? (yes / edit / skip / abort)
   ```

   Note: To show the prompt preview, you must run Step 5 (Build Prompts) for this task first, then present the preview here. If the user rejects the task, discard the prompt.

3. Wait for the user's response per task:
   - **yes**: Include this task in the dispatch batch.
   - **edit**: Allow modification of the task's objective, budget, or acceptance criteria. Re-build the prompt and re-present.
   - **skip**: Exclude this task from the current dispatch. Leave its status as `ready` for a future iteration.
   - **abort**: Update config status to `paused`. **Stop the loop.**

#### Per-Task Override Logic

When the global autonomy is `checkpoint` or `full_auto`, individual tasks may still have their `autonomy` field set to `per_task`. In that case:

1. For tasks flagged with `autonomy: per_task`, apply the per_task approval flow (present individually) even if the global mode would skip approval.
2. For all other tasks, apply the global autonomy behavior.

This allows high-risk or sensitive tasks to require explicit approval even in otherwise automated runs.

---

### Step 5: Build Prompts

For each task approved for dispatch, assemble its sub-agent prompt.

1. **Read `skills/orchestra/context-curator.md`.** Follow the complete assembly procedure defined there (steps P1 through P11). Do not duplicate the Context Curator's logic here — read and execute the instructions in that document.

2. **Pass these inputs to the Context Curator process:**
   - The task file path: `.orchestra/tasks/{TASK_ID}.md`
   - The config file: `.orchestra/config.md`
   - The spec/input files in `.orchestra/input/`
   - The upstream task files for any tasks in the current task's `upstream_tasks`

3. **Receive the assembled prompt.** The Context Curator returns a single string — the complete prompt for the sub-agent.

4. **Check for overflow flag.** If the Context Curator signals that the prompt exceeds the token budget even after trimming, decide:
   - If the overflow is minor (within 20% of budget), proceed with the prompt as-is.
   - If the overflow is major, flag the task for splitting. Append to history: `- [{TIME}] {TASK_ID} flagged for splitting — prompt exceeds budget.` Skip this task in the current dispatch. Present the issue to the user if autonomy is not `full_auto`.

5. **For retry dispatches**, prepend the retry context block. Read `skills/orchestra/result-collector.md`, section "Retry Context Generation," and follow its format. The retry block goes before the Context Curator's output in the final prompt:
   ```
   {Retry Context Block from Result Collector}

   {Context Curator assembled prompt}
   ```

---

### Step 6: Dispatch Sub-Agents

Launch the sub-agents for the current batch.

#### Determine Batch Size

```
parallel_count = min(len(approved_tasks), config.max_parallel)
dispatch_batch = approved_tasks[0:parallel_count]
queued_remainder = approved_tasks[parallel_count:]
```

Tasks in `queued_remainder` stay at `status: ready` and will be dispatched in the next loop iteration.

#### Resolve Target Repository

For each task in `dispatch_batch`:

1. **Read `target_repo`** from the task file's frontmatter.
2. **Resolve repo path:**
   - If `target_repo` is empty or matches `config.primary_repo`: the task targets the primary repo. Use the current working directory as the repo root.
   - If `target_repo` matches a name in `config.registered_repos`: use that repo's `path` value (e.g., `../service-b`).
   - If `target_repo` does not match any known repo: flag as an error. Set the task status to `hard_failure` with reason "Unknown target repository: {target_repo}". Skip this task.

3. **Lazy branch creation.** Check if the feature branch already exists in the target repo:
   ```bash
   git -C {repo_path} branch --list {config.branch_name}
   ```
   If the branch does not exist:
   ```bash
   git -C {repo_path} checkout -b {config.branch_name} {repo_branch_base}
   git -C {repo_path} checkout -    # go back to previous branch
   ```
   The `repo_branch_base` is:
   - For the primary repo: `config.branch_base`.
   - For a registered repo: that repo's `branch_base` from `config.registered_repos`.

   Branch creation happens only once per repo per run. Track which repos have had their branches created to avoid redundant checks.

#### Worktree Isolation

If `config.use_worktrees` is `true`:
- Before dispatching each agent, create an isolated git worktree **in the task's target repository**.
- The worktree is created from the feature branch (`config.branch_name`) in the target repo:
  ```bash
  git -C {repo_path} worktree add {worktree_path} {config.branch_name}
  ```
  Where `{repo_path}` is the resolved path from "Resolve Target Repository" above.
- Each agent's prompt should instruct it to work within its assigned worktree path.
- After the agent completes, changes from the worktree will be merged back by the Result Collector.

If `config.use_worktrees` is `false`:
- Check out the feature branch in the target repo before dispatch:
  ```bash
  git -C {repo_path} checkout {config.branch_name}
  ```
- Agents work directly in the target repo's directory.
- Caution: parallel agents targeting the SAME repo may cause file conflicts. Ensure tasks in the same batch that share a `target_repo` do not modify overlapping files. Tasks targeting DIFFERENT repos can always run in parallel safely.

#### Agent Tool Call Format

For each task in `dispatch_batch`, invoke the Agent tool with this structure:

```
Tool: Agent
prompt: "{assembled prompt from Step 5}"
model: "{config.agent_model}"
```

The `prompt` field contains the full prompt assembled by the Context Curator. The `model` field is the model name from config (e.g., `sonnet`, `opus`).

If the config specifies `agent_type`, pass it as well:
```
Tool: Agent
prompt: "{assembled prompt from Step 5}"
model: "{config.agent_model}"
agentType: "{config.agent_type}"
```

**Working directory:** If `use_worktrees` is true, the agent operates in the worktree path (which is in the target repo). If `use_worktrees` is false, prepend the assembled prompt with a working directory instruction:
```
WORKING DIRECTORY: {resolved_repo_path}
Change to this directory before performing any file operations.
```

#### Update State on Dispatch

For each dispatched task:

1. **Update task status.** Change `status` from `ready` to `running` in the task file frontmatter. Write the file.

2. **Update `dag.md`.** Follow State Manager Operation 4 to refresh the DAG with current statuses.

3. **Append to `history.md`:**
   ```
   - [{TIME}] {TASK_ID} ({TITLE}) — dispatched to sub-agent. Model: {agent_model}. Wave: {wave_number}.
   ```

4. **Write the heartbeat file.** Write `.orchestra/running/{TASK_ID}.json` with this exact shape:
   ```json
   {
     "started_at": "{ISO 8601 timestamp at dispatch}",
     "agent_id": "{Agent tool invocation id if available, else the task ID}",
     "model": "{config.agent_model}",
     "worktree_path": "{the worktree path if use_worktrees is true, else the resolved target-repo path}",
     "wave": {wave_number}
   }
   ```
   This heartbeat is the only live signal the dashboard has that a task is in-flight. Without it, running tasks show `0%` for 5–10 minutes and then jump straight to `done`. The Result Collector deletes this file when the task reaches a terminal status (see `result-collector.md` Step 6d). State Manager Operation 7 sweeps orphans as a safety net for crashes.

#### Parallel Dispatch

When dispatching multiple agents in parallel:
- Issue all Agent tool calls together so they run concurrently.
- Do not wait for one agent to finish before dispatching the next within the same batch.
- The loop will collect all results in Step 7 before proceeding.

---

### Evidence Verification (new pipeline stage)

After the work agent returns and before the Result Collector runs, check whether evidence verification is required.

1. **Read the task's `evidence` field** from `.orchestra/tasks/NNN-slug.md` frontmatter.

2. **If `evidence: false`** — skip verification entirely. Set the task frontmatter field `verification_status: n/a`. Proceed to the Result Collector as normal.

3. **If `evidence: true`** — invoke the Verifier skill (`skills/orchestra/verifier.md`). Pass:
   - The task ID and slug.
   - The path to the task file.
   - The full returned output of the work agent (for NOT_APPLICABLE detection).
   - The work agent's one-paragraph summary (for the verifier's "agent's claim" section).

4. **Consume the Verifier's returned object:**

   | Verdict | `was_not_applicable` | Action | `verification_status` |
   |---|---|---|---|
   | `pass` | `false` | Proceed to Result Collector normally. | `passed` |
   | `pass` | `true` | Proceed to Result Collector. Agent's NOT_APPLICABLE claim was accepted. | `skipped` |
   | `fail` | either | See step 5 below. | determined by retry outcome (see Result Collector Step 5 — after retries exhausted: `failed`) |
   | `inconclusive` | either | See step 5 below. | determined by retry outcome (see Result Collector Step 5 — after retries exhausted: `failed`) |

5. **On `fail` or `inconclusive`:**

   a. **Check retries remaining.** Read the task's `retry_count` field (the same counter used by standard Retry Mechanics). Compare against `max_retries` from `.orchestra/config.md`.

   b. **If retries remain:**
      - Archive the current `.orchestra/evidence/NNN-slug/` contents to `.orchestra/evidence/NNN-slug/attempt-{N}/` (where N is the number of prior archived attempts plus one; the first archive is `attempt-1`).
      - Increment the task's `retry_count` field (same counter as standard Retry Mechanics).
      - Generate the `## Previous Attempt` retry-context block by invoking the Result Collector's Retry Context Generation procedure for this task. Include file-modified list from the archived attempt.
      - Re-dispatch the work agent via the Context Curator. Pass: (a) the `verification_feedback` field containing the verifier's `reason` string (Context Curator injects it via P8b), (b) the `## Previous Attempt` retry-context block (Context Curator includes it alongside P8b feedback so the retry agent knows what files exist).
      - After the re-dispatched agent returns, loop back to step 1 of this Evidence Verification stage.

   c. **If retries exhausted:**
      - Set `verification_status: failed`.
      - Hand off to Result Collector with outcome `soft_failure` and the verifier's reason attached as `unmet_criteria`. This outcome flows through the Dispatcher's standard failure-handling rules. If the task has `fallback: true`, the Fallback Engine will be invoked as part of that standard flow; otherwise, the task is marked failed and its dependents remain blocked.

6. **Record `verification_status` in the task frontmatter** before handing to Result Collector, regardless of outcome.

### Infrastructure-failure escalation (Case F)

If at any point during Evidence Verification the Verifier itself cannot be dispatched (Agent tool error during verifier invocation, image attachment unrecoverable, verifier sub-agent fails after its own retry in `full_auto` AND you cannot treat as `inconclusive` because the failure was environmental), **always pause the run and ask the user, regardless of autonomy mode.** The Verifier skill's Error Handling section specifies the exact prompt to show. Do not auto-pass and do not silently mark `soft_failure` — this is an infrastructure-failure case, not a result-quality case.

---

### Step 7: Collect Results

After all agents in the dispatch batch return, process each result.

1. **Read `skills/orchestra/result-collector.md`.** Follow the complete result processing procedure defined there (Steps 1 through 6). Do not duplicate the Result Collector's logic here — read and execute the instructions in that document.

2. **For each returned agent result**, pass it through the Result Collector process:
   - The raw agent output text.
   - The task ID and task file path.
   - The current timestamp.

3. **The Result Collector will:**
   - Capture raw output to a log file.
   - Detect the outcome (success, soft_failure, hard_failure, scope_conflict).
   - Generate a summary.
   - Verify acceptance criteria.
   - Update the task file with results.
   - Update the DAG and unlock dependent tasks.
   - Append to history.

4. **Collect the outcomes.** After the Result Collector finishes, gather the outcome for each task in the batch. You will need these for Step 8.

---

### Step 8: Handle Failures

If any tasks in the batch resulted in a non-success outcome, handle them according to the current autonomy level.

First, separate the batch results:
- `succeeded` — tasks with outcome `success`.
- `soft_failures` — tasks with outcome `soft_failure`.
- `hard_failures` — tasks with outcome `hard_failure`.
- `scope_conflicts` — tasks with outcome `scope_conflict`.

If all tasks succeeded, skip to Step 9.

#### Mode: `full_auto`

**Hard failures and soft failures:**
1. For each failed task, check its retry count against `config.max_retries`.
2. If retries remain:
   - Reset the task's status to `ready`.
   - Increment the retry counter in the task file (add or update `retry_count` in frontmatter).
   - Append to history: `- [{TIME}] {TASK_ID} — failed ({outcome}), scheduling retry {N}/{max_retries}.`
   - The task will be picked up in the next loop iteration. The retry context block (from the Result Collector) will be prepended to its prompt in Step 5.
3. If retries exhausted:
   - Leave the task as `status: failed`.
   - Append to history: `- [{TIME}] {TASK_ID} — failed ({outcome}), retries exhausted. Marking as failed.`
   - Continue the run. Dependent tasks remain blocked.

**Scope conflicts:**
1. **Pause the pipeline.** Do not dispatch new tasks.
2. Present the conflict to the user:
   ```
   Scope conflict detected in {TASK_ID} ({TITLE}):
   {conflict details from the Result section}

   The task's assumptions do not match the actual project state.

   Options:
   1. replan  — Redefine this task and any affected dependents
   2. retry   — Retry as-is (agent may find a workaround)
   3. skip    — Skip this task and unblock dependents
   4. abort   — Stop the run
   ```
3. Wait for the user's response and act accordingly.
   - **replan**: Allow the user to edit the task file. After edits, reset status to `ready` and return to Step 1.
   - **retry/skip/abort**: Same behavior as in Step 3 Condition B.

**Sibling task behavior:** Tasks in the same wave that are not dependent on the failed task continue running. Only tasks in the failed task's `blocks` list are affected.

#### Mode: `checkpoint`

**Hard failures and soft failures:**
1. Attempt one automatic retry (same as `full_auto` retry logic).
2. If the retry also fails, pause and present to the user:
   ```
   Task {TASK_ID} ({TITLE}) failed after retry.
   Outcome: {outcome}
   Error: {failure summary}

   Options:
   1. retry  — Try again with modified context
   2. edit   — Edit the task definition, then retry
   3. skip   — Skip and unblock dependents
   4. abort  — Stop the run
   ```
3. Wait for the user's response and act accordingly.

**Scope conflicts:**
1. Pause immediately (do not attempt automatic retry).
2. Present the conflict details and proposed changes (same format as `full_auto` scope conflict).
3. Wait for user decision.

#### Mode: `per_task`

**All failure types (hard, soft, scope conflict):**
1. Immediately present the failure to the user. Do not attempt automatic retry.
   ```
   Task {TASK_ID} ({TITLE}) failed.
   Outcome: {outcome}
   Error: {failure summary}
   Unmet criteria: {unmet_criteria from Result section}

   Full output: .orchestra/results/{TASK_ID}.log

   Options:
   1. retry   — Retry with enriched context
   2. edit    — Edit the task, then retry
   3. modify  — Provide additional instructions for the retry
   4. skip    — Skip and unblock dependents
   5. abort   — Stop the run
   ```
2. Wait for the user's response:
   - **retry**: Reset status to `ready`, return to Step 1.
   - **edit**: Allow user to modify the task file, then reset to `ready`.
   - **modify**: Accept additional instructions from the user. Append them to the task file's Objective or a new `## Additional Instructions` section. Reset to `ready`.
   - **skip/abort**: Same as previous modes.

#### Sibling Isolation

Regardless of autonomy mode, these rules apply:
- **Sibling tasks** (tasks in the same wave that do not depend on the failed task) continue execution unaffected.
- **Dependent tasks** (tasks that list the failed task in `depends_on`) remain at `status: pending` and are NOT unlocked.
- Retries of the failed task are scheduled alongside any remaining sibling tasks in the next dispatch batch.

---

### Step 9: Loop

Prepare for the next iteration.

1. **Post-batch sync.** Call **State Manager Operation 7: Post-Batch Sync**, passing the batch task IDs and the wave number. Operation 7 is a single call that (a) runs Operation 4 to regenerate `dag.md` counters and status and propagate readiness to newly-unblocked dependents, (b) validates that `token-usage.json` has an entry for every task that just reached a terminal status, (c) appends a batch-summary line to `history.md`, and (d) sweeps orphan heartbeat files from `.orchestra/running/`. **This call is mandatory — do not skip it and do not substitute a direct Operation 4 call.** Skipping Operation 7 is the documented root cause of stale dashboards: frozen `N / {total} tasks complete` counters, per-task token bars stuck at `0 / 80k`, and missing batch entries in `history.md`.

2. **Update wave tracking.** Determine if the current wave is complete:
   - If all tasks in the current wave have status `done` or `failed` (with no retries pending), the wave is complete.
   - Log the wave transition in history: `- [{TIME}] Wave {N} complete. Advancing to wave {N+1}.`
   - If some tasks in the current wave are still `ready` (queued remainder from Step 6) or `running`, the wave is still active.

3. **Check calibration notification.** Read `.orchestra/token-usage.json` and check the `calibration` section. If `calibration.ratio >= 2.0` AND `calibration.sample_size >= 3`:
   - In `checkpoint` mode: show `"⚠ Budget calibration: tasks averaging {ratio}x over budget. Budgets auto-adjusted for remaining tasks."` as part of the checkpoint pause message.
   - In `full_auto` mode: append to history: `- [{TIME}] ⚠ Calibration ratio {ratio}x — budgets auto-inflated for remaining tasks.`
   - Only show this notification once per threshold crossing (2.0x, 3.0x, etc.). Track the last notified threshold in `calibration.last_notified_threshold` to avoid repeating.

4. **Return to Step 1.** Re-read all state from disk and begin the next iteration.

---

## Wave Tracking

Waves are determined by dependency depth as computed by the Decomposer and recorded in `.orchestra/dag.md`.

### Determining the Current Wave

The current wave is the lowest-numbered wave that contains at least one task with status other than `done`. Read the wave list from `dag.md` and cross-reference with current task statuses.

### Wave Transitions

A wave is complete when every task assigned to that wave has reached a terminal status:
- `done` — successfully completed.
- `failed` — failed with retries exhausted (and user has not chosen to retry or skip).

When a wave completes, log it:
```
- [{TIME}] Wave {N} complete — {done_count} succeeded, {failed_count} failed. Advancing to wave {N+1}.
```

### Wave Numbering in History

Every dispatch entry in `history.md` includes the wave number. This creates an audit trail of which tasks ran in which wave and helps with debugging ordering issues.

---

## Retry Mechanics

When retrying a failed task:

1. **Read `skills/orchestra/result-collector.md`, section "Retry Context Generation."** Follow its instructions to build the retry context block from the failed attempt's data.

2. **Prepend the retry block to the prompt.** When Step 5 builds the prompt for a retry, the retry context block goes before the Context Curator's assembled prompt. This gives the retry agent full knowledge of what was tried before and what went wrong.

3. **Increment retry counter.** Track retries in the task file frontmatter. Add or update:
   ```
   retry_count: {N}
   ```
   Where N increments by 1 each retry.

4. **Respect `max_retries`.** Once `retry_count` equals `config.max_retries`, do not retry again. Mark the task as `failed` (final) and handle according to the autonomy mode.

---

## Delegation Boundaries

The Dispatcher orchestrates but does not implement the internal logic of other components. Here is what the Dispatcher does and does not do:

### Dispatcher Reads and Follows

| Document | When | Purpose |
|----------|------|---------|
| `skills/orchestra/context-curator.md` | Step 5 | Build sub-agent prompts |
| `skills/orchestra/result-collector.md` | Step 7, retries | Process agent output, build retry context |
| `skills/orchestra/state-manager.md` | Steps 1-3, 6, 9 | Read state, update statuses, refresh DAG (Op 4), post-batch sync (Op 7) |

### Dispatcher Does NOT

- **Duplicate prompt assembly logic.** The Context Curator owns prompt construction. The Dispatcher calls it, does not reimplement it.
- **Duplicate result processing logic.** The Result Collector owns outcome detection, summary generation, and criteria verification. The Dispatcher calls it, does not reimplement it.
- **Duplicate DAG update logic.** The State Manager owns DAG synchronization. The Dispatcher triggers it after status changes.
- **Decompose tasks.** The Decomposer owns task creation. The Dispatcher operates on the existing task graph.

---

## Error Handling

Apply these rules throughout the execution loop:

- **Agent tool failure.** If the Agent tool itself errors (not the sub-agent's work, but the tool invocation), treat it as a `hard_failure`. Write the error message to the result log. Proceed through the Result Collector as normal.
- **State file corruption.** If a task file or `dag.md` cannot be parsed, log the error to `history.md`, report to the user, and pause the run. Do not attempt to dispatch tasks with corrupt state.
- **Concurrent modification.** If a file's content has changed unexpectedly between read and write (possible with parallel agents), re-read the file and re-apply the update. Log the conflict to `history.md`.
- **Runaway loop.** If the loop has executed more than `total_tasks * (max_retries + 1) * 2` iterations without completing, halt and report a potential infinite loop to the user.

---

## Key Principles

1. **Disk is the source of truth.** Re-read state from `.orchestra/` at the start of every loop iteration. Never carry stale in-memory state across iterations.
2. **Delegate, do not duplicate.** The Dispatcher calls the Context Curator, Result Collector, and State Manager. It does not reimplement their logic. If those documents are updated, the Dispatcher automatically benefits.
3. **Autonomy gates protect the user.** The gate in Step 4 is not optional. Always respect the configured autonomy level and per-task overrides.
4. **Failures are contained.** A failed task blocks only its dependents, never its siblings. The run continues making progress on independent branches of the DAG.
5. **History is your audit trail.** Every dispatch, completion, failure, retry, wave transition, and user decision is logged to `history.md`. When debugging, the history tells the full story.
6. **Respect parallelism limits.** Never dispatch more agents than `config.max_parallel`. Queue excess tasks for the next iteration.
