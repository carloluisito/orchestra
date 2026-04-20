# Scenario: Failure Handling

## Overview

This scenario validates Orchestra's failure detection, retry mechanics, and scope conflict handling across three distinct test cases. All cases use the same base configuration.

## Configuration

| Setting | Value | Rationale |
|---|---|---|
| `autonomy` | `checkpoint` | Allows automatic first retry but pauses on repeated failure |
| `max_retries` | `2` | Enough retries to test both automatic retry and exhaustion |
| `max_parallel` | `3` | Default parallelism to test sibling isolation |
| `token_budget` | `80000` | Default |
| `agent_model` | `sonnet` | Default |

---

## Case 1: Soft Failure

### Purpose

Validate that the Result Collector correctly detects incomplete output, marks the task as a soft failure, triggers a retry with enriched context, and maintains sibling task isolation.

### Setup

1. Create a run with at least 3 tasks in the same wave, where:
   - **Task A** (`T005`): The target task that will produce incomplete output.
   - **Task B** (`T006`): A sibling task in the same wave (no dependency on T005).
   - **Task C** (`T007`): A dependent task in a later wave (`depends_on: [T005]`).
2. All prior wave tasks are `done`. Tasks A and B are `ready` for dispatch.

### Triggering the Failure

Force Task A's sub-agent to produce incomplete output. The agent should:
- Complete some work (e.g., create one of two required files).
- Explicitly report that not all acceptance criteria are met (e.g., "Partially complete — created the route file but could not implement the validation schema").
- Leave at least one acceptance criterion verifiably unmet (e.g., a required file does not exist on disk).

### Expected Behavior

#### Result Collection (Result Collector Steps 1-6)

1. **Capture:** The agent's full output is written to `.orchestra/results/005-*.log`.

2. **Outcome Detection (Step 2):** The Result Collector classifies the outcome as `soft_failure` because:
   - The agent completed some work but explicitly reports partial completion.
   - The output contains phrases indicating incomplete work ("partially complete," "could not finish").

3. **Summary Generation (Step 3):** A 3-5 sentence summary is produced that includes:
   - What was completed (files created, decisions made).
   - What was not completed (which criteria remain unmet).
   - Interface details for any completed work.

4. **Criteria Verification (Step 4):** Each acceptance criterion is independently checked:
   - Criteria backed by completed work: marked `met`.
   - Criteria for missing work: marked `unmet`.
   - The Step 2 outcome remains `soft_failure` (no override needed since it was not `success`).

5. **Task File Update (Step 5):**
   - Status changed to `failed`.
   - Result section populated with `outcome: soft_failure`, `unmet_criteria` listing the unmet items.

6. **State Propagation (Step 6):**
   - `dag.md` updated with new status.
   - Dependent tasks (Task C / T007) remain `pending` — NOT unlocked.
   - History entry appended: `T005 ({TITLE}) — completed with outcome: soft_failure.`

#### Sibling Task Behavior

- **Task B (T006)** continues execution unaffected. Its dispatch, execution, and result collection proceed independently of Task A's failure.
- Task B's outcome is processed normally regardless of Task A's status.

#### Dependent Task Behavior

- **Task C (T007)** remains at `status: pending`. It is NOT unlocked because its dependency (T005) has not reached `done`.
- Task C will not be dispatched until T005 succeeds (either via retry or user intervention).

#### Retry Handling (Dispatcher Step 8, checkpoint mode)

1. **First retry is automatic.** Since `autonomy: checkpoint` allows one automatic retry before pausing:
   - Task A's status is reset from `failed` to `ready`.
   - `retry_count` is set to `1` in the task frontmatter.
   - History entry: `T005 — failed (soft_failure), scheduling retry 1/2.`

2. **Retry context is generated.** The Result Collector's "Retry Context Generation" section produces an enriched context block:
   ```
   ## Previous Attempt
   outcome: soft_failure
   what_was_tried: {summary of what the agent completed}
   error: {specific unmet criteria and what was expected vs. found}
   files_modified: {list of files from the partial attempt}
   ```

3. **Retry dispatch.** On the next loop iteration:
   - The Context Curator assembles a new prompt for Task A.
   - The retry context block is prepended to the prompt.
   - The agent receives full knowledge of what was tried before and what went wrong.

4. **If retry succeeds:** Task A moves to `done`, Task C is unlocked, normal execution continues.

5. **If retry fails again:** Since `autonomy: checkpoint` and this is the second failure, the pipeline pauses. The user is presented with options (retry, edit, skip, abort).

### Validation Checklist — Case 1

- [ ] Result Collector detects `soft_failure` outcome (not `success` or `hard_failure`)
- [ ] Agent output is written to `.orchestra/results/005-*.log`
- [ ] Summary includes what was completed and what was not
- [ ] Acceptance criteria are independently verified (not trusting agent self-report)
- [ ] At least one criterion is marked `unmet`
- [ ] Task file status is set to `failed`
- [ ] Task file Result section contains `outcome: soft_failure`
- [ ] Task file Result section lists `unmet_criteria`
- [ ] `dag.md` is updated with the failed status
- [ ] Sibling task (T006) continues execution unaffected
- [ ] Dependent task (T007) remains `pending` (NOT unlocked)
- [ ] Automatic retry is scheduled (retry_count incremented to 1)
- [ ] Retry context block is generated with previous attempt details
- [ ] Retry prompt includes the enriched context
- [ ] History records the failure and retry scheduling

---

## Case 2: Hard Failure

### Purpose

Validate that the Result Collector detects a hard failure (agent crash or inability to produce work), retries are attempted, and the checkpoint pause triggers after retries are exhausted.

### Setup

1. Create a run where **Task D** (`T008`) is ready for dispatch.
2. Task D has dependent tasks downstream (e.g., `T009` and `T010` both have `depends_on: [T008]`).

### Triggering the Failure

Force Task D's sub-agent to error. The agent should produce one of:
- An empty or near-empty response (less than 2 sentences, no completed work described).
- An explicit error report: "Cannot proceed — tool failure" or "Unrecoverable error."
- The Agent tool itself returns an error rather than a text result.

### Expected Behavior

#### Result Collection

1. **Outcome Detection:** The Result Collector classifies as `hard_failure` because:
   - The output is empty, garbled, or describes no completed work.
   - Or the agent reports a crash / unrecoverable failure.
   - Or the Agent tool returned an error.

2. **Summary Generation:** Summary states: "Agent returned no output" or "Agent reported unrecoverable error: {details}."

3. **Criteria Verification:** Skipped for `hard_failure` — the agent produced no usable work, so there is nothing to verify.

4. **Task File Update:** Status set to `failed`, outcome set to `hard_failure`.

5. **State Propagation:** Dependent tasks (T009, T010) remain `pending`.

#### Retry #1 (Automatic)

Under `checkpoint` autonomy:
1. First retry is automatic.
2. Task D's status is reset to `ready`, `retry_count` set to `1`.
3. Retry context block is generated:
   ```
   ## Previous Attempt
   outcome: hard_failure
   what_was_tried: Agent returned no output / Agent crashed with error: {details}
   error: {specific error message or "no output produced"}
   files_modified: none
   ```
4. Task D is re-dispatched with the enriched prompt.
5. History records: `T008 — failed (hard_failure), scheduling retry 1/2.`

#### Retry #2 (After Retry #1 Also Fails)

If retry #1 also produces a hard failure:
1. `retry_count` increments to `2`.
2. Since `max_retries` is `2` and this is the second retry (retry_count == max_retries), the checkpoint pause triggers.

**Note:** The Dispatcher's checkpoint mode behavior is: "Attempt one automatic retry. If the retry also fails, pause and present to the user." Since `max_retries: 2`, the first retry is automatic, and if it fails, the second retry attempt triggers a pause rather than auto-dispatching.

#### Checkpoint Pause

The pipeline pauses and presents:

```
Task T008 ({TITLE}) failed after retry.
Outcome: hard_failure
Error: {failure summary — e.g., "Agent returned no output on both attempts"}

Options:
1. retry  — Try again with modified context
2. edit   — Edit the task definition, then retry
3. skip   — Skip and unblock dependents
4. abort  — Stop the run
```

The user must choose an action before execution continues.

#### User Response Handling

| User Choice | Expected Behavior |
|---|---|
| **retry** | Reset Task D to `ready`, build new retry prompt, re-enter dispatch loop |
| **edit** | User modifies task file (objective, criteria, relevant_files), then reset to `ready` |
| **skip** | Mark Task D as `done` (skipped), unlock T009/T010, note in Result: `SKIPPED — marked done by user to unblock dependents` |
| **abort** | Set config status to `failed`, append `Run aborted by user` to history, stop the loop |

### Validation Checklist — Case 2

- [ ] Result Collector detects `hard_failure` outcome
- [ ] Agent output (even if empty or error) is written to results log
- [ ] Summary accurately describes the failure
- [ ] Criteria verification is skipped for hard_failure
- [ ] Task status set to `failed`, outcome `hard_failure`
- [ ] Dependent tasks (T009, T010) remain `pending`
- [ ] Retry #1 is dispatched automatically (checkpoint mode allows first auto-retry)
- [ ] `retry_count` is correctly incremented
- [ ] Retry context block includes hard_failure details
- [ ] If retry #1 fails, checkpoint pause triggers
- [ ] User is presented with the failure and 4 options (retry, edit, skip, abort)
- [ ] Error message shown to user is specific (not generic "task failed")
- [ ] Choosing "skip" marks the task as `done` and unlocks dependents
- [ ] Choosing "abort" sets config status to `failed` and stops the loop
- [ ] History records each failure, each retry attempt, and the user's final decision

---

## Case 3: Scope Conflict

### Purpose

Validate that when a sub-agent discovers the specification's assumptions are wrong (e.g., an expected dependency does not exist, the codebase structure differs from what the spec describes), the pipeline pauses regardless of autonomy mode, the conflict is presented with details, and affected downstream tasks are identified.

### Setup

1. Create a run where **Task E** (`T011`) is dispatched.
2. Task E's objective references an assumption from the spec — for example: "Implement input validation using Zod schemas for all endpoints" — but the actual codebase uses a different validation library (e.g., `joi`) that was set up by an earlier task, contradicting the spec's assumption.
3. Task E has downstream dependents: `T012` (error handling middleware, `depends_on: [T011]`) and `T013` (integration tests, `depends_on: [T011, T012]`).

### Triggering the Conflict

The sub-agent for Task E discovers the mismatch and reports:
- "The spec says to use Zod for validation, but the codebase already has Joi installed and configured by T003. Using Zod would create conflicting validation systems."
- Or: "This task requires package X which is not installed and not mentioned in any upstream task."
- Or: "The task assumes the route file exports a router instance, but the actual file uses a different pattern."

### Expected Behavior

#### Result Collection

1. **Outcome Detection:** The Result Collector classifies as `scope_conflict` because:
   - The agent reports that the task's assumptions do not match the actual project state.
   - The agent explicitly questions the task definition.
   - The agent discovered an uncaptured dependency or contradiction.

2. **Summary Generation:** Summary describes the conflict:
   - What the task assumed (from the spec/objective).
   - What the agent actually found (from the codebase).
   - Why the two are incompatible.

3. **Criteria Verification:** Skipped for `scope_conflict`.

4. **Task File Update:** Status set to `failed`, outcome set to `scope_conflict`.

5. **State Propagation:** Dependent tasks remain `pending`.

#### Pipeline Pause (Mandatory)

**Scope conflicts always pause the pipeline, regardless of autonomy mode.** This is true for all three autonomy levels:

- `full_auto`: Pauses despite normally running without user intervention.
- `checkpoint`: Pauses immediately (does not attempt automatic retry).
- `per_task`: Pauses immediately.

The rationale (from Dispatcher Step 8): scope conflicts mean the task definition itself may be wrong. Retrying with the same definition would likely produce the same conflict. Human judgment is required.

#### Conflict Presentation

The user is shown:

```
Scope conflict detected in T011 ({TITLE}):
{conflict details from the Result section — e.g., "Spec assumes Zod validation but codebase uses Joi (installed by T003)"}

The task's assumptions do not match the actual project state.

Affected downstream tasks:
- T012 ({TITLE}): depends on T011
- T013 ({TITLE}): depends on T011, T012

Options:
1. replan  — Redefine this task and any affected dependents
2. retry   — Retry as-is (agent may find a workaround)
3. skip    — Skip this task and unblock dependents
4. abort   — Stop the run
```

Key elements of the presentation:
- The **conflict details** are specific — not a generic "task failed" message.
- **Affected downstream tasks** are explicitly identified by tracing the dependency graph from T011 forward.
- The **replan** option is offered first, as it is the recommended action for scope conflicts.

#### User Response Handling

| User Choice | Expected Behavior |
|---|---|
| **replan** | User edits the task file (changes objective, acceptance criteria, relevant_files to align with reality). Optionally edits downstream tasks too. After edits, Task E is reset to `ready` and the loop resumes. |
| **retry** | Task E is reset to `ready` as-is. The agent may find a workaround, but may also hit the same conflict. |
| **skip** | Task E is marked `done` (skipped). Dependents T012, T013 are unlocked. Risk: downstream tasks may encounter the same assumption mismatch. |
| **abort** | Config status set to `failed`. Run stops. |

#### Replan Details

If the user chooses **replan**:
1. The user modifies Task E's file (e.g., changes objective from "Implement validation using Zod" to "Implement validation using Joi, aligning with existing setup from T003").
2. The user may also update downstream tasks if the conflict cascades (e.g., T013's acceptance criteria may reference Zod-specific assertions that need updating).
3. After edits, Task E's status is reset to `ready`.
4. The Dispatcher returns to Step 1 and re-reads all state from disk.
5. Task E is dispatched with the corrected definition.
6. History records: `T011 — replanned by user after scope conflict. Original objective: "...". New objective: "...".`

### Validation Checklist — Case 3

- [ ] Result Collector detects `scope_conflict` outcome (not soft_failure or hard_failure)
- [ ] Agent output is written to results log
- [ ] Summary describes the specific conflict (what was assumed vs. what was found)
- [ ] Criteria verification is skipped for scope_conflict
- [ ] Task status set to `failed`, outcome `scope_conflict`
- [ ] Pipeline pauses regardless of autonomy setting
- [ ] No automatic retry is attempted for scope conflicts
- [ ] Conflict details are presented to the user (not a generic error message)
- [ ] Affected downstream tasks are identified by traversing the dependency graph
- [ ] All downstream dependents are listed (T012, T013 — both direct and transitive)
- [ ] User is presented with 4 options (replan, retry, skip, abort)
- [ ] "replan" allows editing the task definition before retry
- [ ] "replan" allows editing downstream tasks affected by the conflict
- [ ] After replan, task is reset to `ready` and Dispatcher re-reads state from disk
- [ ] "skip" marks the task as done and unlocks dependents
- [ ] History records the scope conflict and the user's resolution choice

---

## Cross-Case Validation

These checks apply across all three test cases to verify systemic behavior.

### Sibling Isolation
- [ ] In all cases, sibling tasks (same wave, no dependency on the failed task) continue execution
- [ ] Sibling task dispatch is not delayed by the failed task's retry process
- [ ] Sibling task results are collected and processed independently

### Dependent Blocking
- [ ] In all cases, dependent tasks remain `pending` while the failed task is unresolved
- [ ] Dependents are NOT unlocked until the failed task reaches `done` (via success, user skip, or replan+retry)
- [ ] Dependents that list the failed task in `depends_on` are correctly identified

### Retry Context Quality
- [ ] Retry context blocks include the specific outcome type
- [ ] Retry context blocks include what was tried (summary from previous attempt)
- [ ] Retry context blocks include the specific error or unmet criteria
- [ ] Retry context blocks list files modified (even partial modifications)
- [ ] Retry agents receive the enriched context prepended to their prompt

### State Consistency
- [ ] After each failure and retry, `dag.md` accurately reflects all task statuses
- [ ] `history.md` contains a complete audit trail of every failure, retry, pause, and user decision
- [ ] Task files retain their original objectives and criteria through failures and retries (no data loss)
- [ ] `config.md` status reflects the current run state (`running` during retries, `paused` or `failed` on user abort)
- [ ] Result logs accumulate across retries (each attempt's output is preserved)

### Autonomy Checkpoint Behavior
- [ ] First retry after soft_failure or hard_failure is automatic (no user prompt)
- [ ] Second consecutive failure triggers a pause with user options
- [ ] Scope conflicts pause immediately without any automatic retry
- [ ] User decisions (retry, skip, edit, abort, replan) are all functional and correctly update state
