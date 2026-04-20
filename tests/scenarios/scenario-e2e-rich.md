# Scenario: End-to-End Integration — Rich Input

## Purpose

Validate the complete Orchestra flow from initial input through final completion, using the sample fixtures as input. This scenario traces every stage of the pipeline — initialization, decomposition, multi-wave dispatch with autonomy gates, result collection, and completion — to confirm that the system produces correct state at each step and enforces context isolation guarantees throughout.

**Input fixtures:**
- Spec: `tests/fixtures/sample-spec.md` (Task Management API specification)
- Plan: `tests/fixtures/sample-plan.md` (4-phase, 16-step implementation plan)

---

## Step 1: Initialize

**Command:**
```
/orchestra run tests/fixtures/sample-spec.md tests/fixtures/sample-plan.md
```

Accept all default configuration when prompted (token_budget: 80000, autonomy: checkpoint, max_parallel: 3, max_retries: 2, agent_model: sonnet, use_worktrees: true).

### Expected State After Step 1

**Directory structure created:**
```
.orchestra/
├── config.md
├── history.md
├── input/
│   ├── sample-spec.md
│   └── sample-plan.md
├── tasks/          (empty, populated in Step 2)
└── results/        (empty, populated in Step 3+)
```

**Validations:**
- [ ] `.orchestra/` directory exists at the project root
- [ ] `.orchestra/config.md` exists and contains frontmatter with all default values:
  - `token_budget: 80000`
  - `autonomy: checkpoint`
  - `max_parallel: 3`
  - `max_retries: 2`
  - `agent_model: sonnet`
  - `use_worktrees: true`
  - `status: in_progress`
- [ ] `.orchestra/input/sample-spec.md` is a copy of the original spec fixture
- [ ] `.orchestra/input/sample-plan.md` is a copy of the original plan fixture
- [ ] `.orchestra/history.md` exists and contains an initialization entry with a timestamp
- [ ] `.orchestra/tasks/` directory exists (may be empty)
- [ ] `.orchestra/results/` directory exists (empty)

---

## Step 2: Decomposition

After initialization, the Decomposer classifies the input and produces the task DAG.

### Expected Classification

- **Richness:** Rich (both a structured spec with headings/tables and a numbered implementation plan are present)
- **Procedure:** Procedure A (Rich Input Decomposition)

### Expected Task Output

The 16 plan steps should be grouped into 10-12 tasks according to the decomposer's merging rules. Tasks are written to `.orchestra/tasks/` with the naming pattern `NNN-slug.md`.

**Approximate task mapping (see `scenario-rich-input.md` for detailed breakdown):**

| Task ID | Title (approx.) | Source Steps | Wave |
|---------|-----------------|-------------|------|
| T001 | Init project with TypeScript | Step 1 | 1 |
| T002 | Prisma schema and migration | Steps 2-4 | 2 |
| T003 | Password hashing utility | Step 5 | 2 |
| T004 | JWT utility | Step 6 | 2 |
| T005 | Register endpoint | Step 7 | 3 |
| T006 | Login endpoint | Step 8 | 3 |
| T007 | Auth middleware | Step 9 | 3 |
| T008 | GET /tasks endpoint | Step 10 | 4 |
| T009 | POST /tasks endpoint | Step 11 | 4 |
| T010 | PATCH and DELETE /tasks | Steps 12-13 | 4 |
| T011 | Input validation with Zod | Step 14 | 5 |
| T012 | RFC 7807 error handler | Step 15 | 5 |
| T013 | Integration tests | Step 16 | 5 |

### Expected DAG Structure

`.orchestra/dag.md` should contain 4-5 waves:

```
Wave 1: T001
Wave 2: T002, T003, T004
Wave 3: T005, T006, T007
Wave 4: T008, T009, T010
Wave 5: T011, T012, T013
```

### Validations

- [ ] Input classified as "Rich" (both spec and numbered plan exist)
- [ ] 10-12 task files exist in `.orchestra/tasks/`
- [ ] Each task file follows the naming pattern `NNN-slug.md` with zero-padded IDs
- [ ] Each task slug is kebab-case and at most 30 characters
- [ ] `.orchestra/dag.md` exists with 4-5 waves
- [ ] DAG is presented to the user for approval (autonomy is `checkpoint`)
- [ ] No circular dependencies exist in the DAG
- [ ] Every numbered plan step maps to at least one task
- [ ] Each task file contains:
  - A single-sentence `## Objective`
  - `spec_sections` in `## Context Pointers` (at least one entry)
  - `relevant_files` in `## Context Pointers` (at least one entry)
  - `## Acceptance Criteria` with 2-5 checkbox items
  - A `token_budget` value in frontmatter
- [ ] `.orchestra/history.md` has a decomposition entry
- [ ] `.orchestra/config.md` status is `in_progress`

---

## Step 3: Wave 1 Execution

Wave 1 contains a single task (T001 — project initialization) with no dependencies.

### Expected Behavior

1. Dispatcher identifies T001 as the only ready task.
2. Since autonomy is `checkpoint` and this is the first wave, the Dispatcher presents Wave 1 for approval.
3. Upon approval, Context Curator assembles T001's prompt.
4. T001 is dispatched to a sub-agent.
5. Result Collector captures the output.

### Prompt Assembly Validation (T001)

- [ ] Sub-agent receives a prompt with sections: OBJECTIVE, ACCEPTANCE CRITERIA, CONSTRAINTS
- [ ] Prompt does NOT contain the full spec (only slices from `spec_sections`)
- [ ] Prompt does NOT contain the implementation plan
- [ ] Prompt does NOT contain details of any other tasks (T002-T013)
- [ ] No UPSTREAM RESULTS section (T001 has no dependencies)
- [ ] Estimated token count is under the task's token budget (80% of budget target)

### State After Wave 1

- [ ] T001 status transitions: `pending` -> `ready` -> `running` -> `done`
- [ ] `.orchestra/results/001-*.log` exists with the full agent output
- [ ] T001 task file `## Result` section is populated with:
  - `summary` (3-5 sentences describing what was created)
  - `files_changed` (list of created/modified files)
  - `outcome: success`
  - `completed_at` (ISO 8601 timestamp)
- [ ] Dependents of T001 are unlocked (T002, T003, T004 transition to `ready`)
- [ ] `.orchestra/history.md` updated with dispatch and completion entries for T001
- [ ] `.orchestra/dag.md` reflects T001 as `done`

---

## Step 4: Wave 2 Execution (Parallel)

Wave 2 contains multiple tasks (T002, T003, T004) that all depend only on T001 and can run in parallel.

### Expected Behavior

1. Dispatcher identifies T002, T003, T004 as ready (all dependencies met).
2. Since autonomy is `checkpoint` and this is a new wave, the Dispatcher:
   - Presents a summary of Wave 1 results.
   - Lists Wave 2 tasks for approval.
3. Upon approval, Context Curator assembles prompts for all three tasks.
4. Up to `max_parallel` (3) agents are dispatched simultaneously.
5. Result Collector processes each agent's output independently.

### Prompt Assembly Validation (Wave 2 Tasks)

**T002 — Prisma schema and migration:**
- [ ] SPEC CONTEXT includes the "Data Model" section from the spec (User and Task tables)
- [ ] UPSTREAM RESULTS includes T001 summary only (not full output)
- [ ] Prompt does NOT contain auth endpoint details, error handling requirements, or other unrelated spec sections

**T003 — Password hashing utility:**
- [ ] Prompt is focused on password hashing only
- [ ] UPSTREAM RESULTS includes T001 summary
- [ ] Prompt does NOT contain JWT details, database schema, or endpoint definitions

**T004 — JWT utility:**
- [ ] Prompt is focused on JWT signing/verification only
- [ ] UPSTREAM RESULTS includes T001 summary
- [ ] Prompt does NOT contain password hashing details, database schema, or endpoint definitions

**Cross-agent isolation (all Wave 2 tasks):**
- [ ] Each agent receives independent context — no agent sees another Wave 2 task's objective or details
- [ ] Each prompt is under the task's token budget
- [ ] Upstream results from T001 are passed as summaries, not full agent output

### State After Wave 2

- [ ] T002, T003, T004 all reach `status: done`
- [ ] Result logs exist: `002-*.log`, `003-*.log`, `004-*.log`
- [ ] Each task file has a populated `## Result` section with summary and outcome
- [ ] Wave 3 tasks whose dependencies are now met transition to `ready`
- [ ] `.orchestra/history.md` has dispatch and completion entries for all three tasks
- [ ] `.orchestra/dag.md` reflects updated statuses

---

## Step 5: Checkpoint Pause (autonomy=checkpoint)

Between every wave transition, the Dispatcher pauses for user approval.

### Expected Behavior at Each Wave Boundary

1. **Wave completion summary presented:**
   ```
   Wave {N} complete:
   - {TASK_ID} ({TITLE}): success — {one-line summary}
   - {TASK_ID} ({TITLE}): success — {one-line summary}
   ```

2. **Next wave listed for approval:**
   ```
   Wave {N+1} ready ({COUNT} tasks):
   - {TASK_ID} ({TITLE}): {objective} [budget: {token_budget} tokens]
   ...

   Proceed? (yes / edit / abort)
   ```

3. **Pause until user approves.** The Dispatcher does NOT dispatch tasks for the next wave until the user responds with `yes`.

### Validations

- [ ] Checkpoint pause occurs between Wave 1 and Wave 2
- [ ] Checkpoint pause occurs between Wave 2 and Wave 3
- [ ] Checkpoint pause occurs between Wave 3 and Wave 4
- [ ] Checkpoint pause occurs between Wave 4 and Wave 5
- [ ] Each pause includes a summary of the completed wave
- [ ] Each pause lists the next wave's tasks with objectives and budgets
- [ ] No tasks from a future wave are dispatched before approval
- [ ] If user selects "abort", config status changes to `paused` and the loop stops
- [ ] If user selects "edit", task modifications are accepted and the wave is re-presented

---

## Step 6: Completion

After all waves have been dispatched and all tasks reach `done`, the run completes.

### Expected Behavior

1. Dispatcher's completion check (Step 3, Condition A) triggers: all tasks are `done`.
2. A final summary is presented to the user.
3. State is updated to reflect completion.

### Final Summary Contents

- [ ] Total tasks completed vs total (e.g., `12/12 tasks completed` or `13/13 tasks completed`)
- [ ] No failed tasks listed (in the happy path)
- [ ] Total elapsed time from run start to completion

### Final State

- [ ] `.orchestra/config.md` status is `completed`
- [ ] All task files have `status: done` in frontmatter
- [ ] All task files have populated `## Result` sections
- [ ] `.orchestra/results/` contains a `.log` file for every task
- [ ] `.orchestra/dag.md` shows all tasks as `done` with correct counters
- [ ] `.orchestra/history.md` has a full chronological log including:
  - Initialization entry
  - Decomposition entry
  - Dispatch entries for every task (with wave numbers)
  - Completion entries for every task (with outcomes)
  - Wave transition entries
  - Final completion entry: `Run complete — all tasks done.`

---

## Success Criteria — Context Isolation Guarantees

These are the core invariants that Orchestra must enforce across the entire run. Violation of any of these indicates a fundamental design failure.

### 1. No sub-agent received the full spec

- [ ] Every dispatched prompt's SPEC CONTEXT section contains only the sections listed in that task's `spec_sections` field
- [ ] No prompt contains all spec headings (Overview, Data Model, API Endpoints — Auth, API Endpoints — Tasks, Requirements)
- [ ] Utility tasks (T003, T004) received minimal or no spec context

### 2. No sub-agent received other tasks' details

- [ ] No prompt contains the objective or acceptance criteria of any task other than the one being dispatched
- [ ] No prompt contains other tasks' `## Context Pointers` or `## Result` sections
- [ ] UPSTREAM RESULTS sections contain only summaries (single-line per upstream task), never the full task file content

### 3. Each prompt was under the token budget

- [ ] Every assembled prompt's estimated token count (`total_characters / 4`) is at or below 80% of the task's `token_budget`
- [ ] If any prompt exceeded the soft target, trimming was applied in the correct order: RELEVANT FILES first, SPEC CONTEXT second, UPSTREAM RESULTS third
- [ ] OBJECTIVE, ACCEPTANCE CRITERIA, and CONSTRAINTS were never trimmed regardless of budget pressure

### 4. Upstream results passed as summaries, not full output

- [ ] Every UPSTREAM RESULTS entry is a single line: `{TASK_ID} ({title}): {summary sentence}`
- [ ] No prompt contains the raw content of any `.orchestra/results/*.log` file
- [ ] No prompt contains upstream agents' full output text

### 5. Implementation plan was not forwarded to agents

- [ ] The plan file (`sample-plan.md`) was consumed only by the Decomposer during Step 2
- [ ] No dispatched prompt contains the plan's phase headings or numbered step list
- [ ] Agents received task-level objectives derived from the plan, not the plan itself

---

## Failure Scenario: Wave 1 Task Fails

If T001 fails during Wave 1, validate the failure handling path:

- [ ] Result Collector detects the failure (hard_failure or soft_failure)
- [ ] Outcome override applies if acceptance criteria are unmet despite agent claiming success
- [ ] With `autonomy: checkpoint`, one automatic retry is attempted
- [ ] Retry prompt includes the "Previous Attempt" block with error details
- [ ] If retry also fails, the Dispatcher pauses and presents options to the user
- [ ] Dependent tasks (T002, T003, T004) remain `pending` — they are NOT unlocked
- [ ] `.orchestra/history.md` records the failure and retry attempt

---

## Failure Scenario: Parallel Task Fails in Wave 2

If T003 fails but T002 and T004 succeed during Wave 2:

- [ ] T002 and T004 complete normally — sibling tasks are not affected
- [ ] T003's dependents (T005 — Register endpoint) remain `pending`
- [ ] Tasks that do not depend on T003 (e.g., T006 via T004, T007 via T004) proceed normally
- [ ] The Dispatcher presents the failure to the user after the automatic retry exhausts
- [ ] If the user chooses "skip", T003 is marked `done` (skipped) and dependents unlock
- [ ] History records the failure, retry, and user decision
