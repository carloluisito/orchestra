# Scenario: Lean Input Decomposition

## Input

- **Prompt:** `"Build a REST API with Express and TypeScript that manages a todo list with user authentication"`
- **Expected Classification:** Lean (brief prompt, under 200 words, no structured requirements or plan)

## Setup

1. Start in an empty directory with no existing code, no `package.json`, no framework files.
2. No `.orchestra/` directory exists (fresh run).
3. Run `/orchestra run "Build a REST API with Express and TypeScript that manages a todo list with user authentication"`.
4. Accept all default configuration values when prompted.

## Expected Configuration

After accepting defaults, `.orchestra/config.md` should contain:

| Setting | Value |
|---|---|
| `token_budget` | `80000` |
| `autonomy` | `checkpoint` |
| `max_parallel` | `3` |
| `max_retries` | `2` |
| `agent_model` | `sonnet` |
| `use_worktrees` | `true` |

---

## Expected Behavior

### Input Classification

The Decomposer should classify this input as **Lean** because:
- The input is a single sentence (well under 200 words).
- There is no specification document or structured plan with numbered steps.
- It is a raw idea describing a multi-part deliverable.

The Decomposer should then follow **Procedure C (Lean Input Decomposition)**, specifically **C1 -> C2** (clear multi-part deliverable: API with distinct components — project setup, data model, auth, CRUD, tests).

### Codebase Scan

Before finalizing tasks, the Decomposer should scan the current project directory (Procedure B, Step B5, invoked from C2). Since the directory is empty:
- No existing framework or language setup is detected.
- A "project init" task must be included.
- No naming conventions are pre-established — tasks should use reasonable defaults (e.g., `src/` directory structure).

### Task Generation

Following C2's guidance to "be conservative: create fewer, larger tasks. Prefer 3-5 tasks total over 10-12," but given the prompt describes at least 5 distinct concerns (init, data model, auth, CRUD, tests), the Decomposer should produce **8-15 tasks** covering:

| Concern | Expected Coverage |
|---|---|
| Project initialization | TypeScript project setup, `tsconfig.json`, dependency installation, Express app scaffold |
| Data model / schema | Database schema definition (User and Task models), ORM setup, migration |
| Authentication | Password hashing, JWT utilities, register endpoint, login endpoint, auth middleware |
| CRUD operations | GET, POST, PATCH, DELETE endpoints for todos/tasks |
| Validation & error handling | Input validation (e.g., Zod), error response formatting |
| Testing | Integration or end-to-end tests covering auth and CRUD flows |

The Decomposer infers these components from the prompt's keywords: "REST API," "Express," "TypeScript," "todo list," "user authentication."

### Acceptance Criteria Generation

Each task should have **2-5 acceptance criteria** derived from:
- Implicit standards (file exists, code compiles, function signatures correct).
- Inferred requirements from the prompt (e.g., "API manages a todo list" implies CRUD endpoints; "user authentication" implies register/login/protected routes).
- Reasonable defaults for a REST API (JSON responses, proper HTTP status codes, error handling).

### Token Budgets

All tasks should use the default `token_budget` of **80000** as the baseline, with adjustments per Procedure A5:
- Simple tasks (init, single utility): ~40000 (50%)
- Standard tasks (endpoint implementation, middleware): ~80000 (100%)
- Complex tasks (integration tests, cross-cutting validation): ~120000 (150%)

### Wave Structure

Tasks should be organized into **3-5 waves** based on dependency depth:

| Wave | Expected Content |
|---|---|
| Wave 1 | Project initialization (no dependencies) |
| Wave 2 | Data model/schema, utility modules (depend on init) |
| Wave 3 | Auth endpoints, middleware (depend on schema + utilities) |
| Wave 4 | CRUD endpoints (depend on auth middleware + schema) |
| Wave 5 | Validation, error handling, tests (depend on endpoints) |

Some waves may be merged if the Decomposer produces fewer tasks (e.g., waves 4 and 5 could collapse).

---

## Expected Output Artifacts

After decomposition completes, the following should exist on disk:

### Directory Structure

```
.orchestra/
  config.md              # Status: in_progress
  dag.md                 # All tasks listed with wave assignments
  history.md             # Entries for initialization and decomposition
  input/
    prompt.md            # Contains the raw prompt text
  tasks/
    001-*.md             # First task (project init)
    002-*.md             # Second task
    ...                  # 8-15 task files total
  results/               # Empty directory
```

### config.md

- `status` field should be `in_progress` (updated from `pending` by Decomposer step O3).
- All default settings populated.

### dag.md

- Frontmatter `total_tasks` matches the number of task files.
- Task table contains one row per task with ID, title, dependencies, and status (`pending` for all).
- Wave list contains 3-5 waves with task IDs grouped by dependency depth.

### history.md

Should contain at minimum:
1. An initialization entry from the State Manager.
2. A decomposition entry: `Decomposer completed — {N} tasks created across {W} waves. Input classified as lean.`

### Task Files

Each task file should follow the template from `skills/orchestra/templates/task-template.md` with:
- Sequential zero-padded IDs: `T001`, `T002`, ...
- Kebab-case slugs, max 30 characters.
- Properly formatted frontmatter with all required fields.

---

## Validation Checklist

### Input Classification
- [ ] Decomposer classifies input as "lean"
- [ ] Procedure C is followed (not A or B)
- [ ] C1 assessment identifies "clear multi-part deliverable"
- [ ] C2 path is taken (decompose like Medium)

### Codebase Scan
- [ ] Decomposer scans the working directory for existing files
- [ ] Empty directory is correctly detected (no existing framework)
- [ ] A project initialization task is included in the output

### Task Count and Coverage
- [ ] Between 8 and 15 tasks generated (inclusive)
- [ ] Project initialization is covered
- [ ] Database schema / ORM setup is covered
- [ ] User authentication (register, login) is covered
- [ ] Auth middleware (JWT protection) is covered
- [ ] Todo CRUD endpoints are covered (at least GET, POST, PATCH/PUT, DELETE)
- [ ] Input validation is covered
- [ ] Testing is covered
- [ ] No major gap — every concern from the prompt maps to at least one task

### Task Quality
- [ ] Every task has a single-sentence objective in `## Objective`
- [ ] Objectives describe what is produced, not how (per Decomposer Q2)
- [ ] Every task has 2-5 acceptance criteria (per Decomposer Q1)
- [ ] No acceptance criteria are empty or placeholder text
- [ ] Every task has at least one entry in `relevant_files`
- [ ] Token budgets are assigned to every task (no zero or null values)
- [ ] Simple tasks have lower budgets than complex tasks

### Dependencies and DAG
- [ ] No circular dependencies exist (per Decomposer Q3)
- [ ] All non-init tasks depend on at least one earlier task
- [ ] Auth endpoints depend on schema and utility tasks
- [ ] CRUD endpoints depend on auth middleware
- [ ] Test tasks depend on the endpoints they test
- [ ] `dag.md` task table matches the individual task files
- [ ] `dag.md` wave list covers all tasks (no orphans, per Q4)

### Wave Structure
- [ ] Between 3 and 5 waves (inclusive)
- [ ] Wave 1 contains only project initialization (or init + one independent task)
- [ ] No wave is empty
- [ ] Later waves contain tasks with higher dependency depth
- [ ] Testing or integration tasks appear in the final wave

### State Integrity
- [ ] `.orchestra/config.md` exists with `status: in_progress`
- [ ] `.orchestra/config.md` contains default configuration values (token_budget: 80000, autonomy: checkpoint, etc.)
- [ ] `.orchestra/dag.md` exists with correct `total_tasks` count
- [ ] `.orchestra/history.md` exists with initialization and decomposition entries
- [ ] `.orchestra/input/prompt.md` exists and contains the original prompt text
- [ ] All task files exist in `.orchestra/tasks/` with the naming pattern `NNN-slug.md`
- [ ] Task IDs are sequential and zero-padded (T001, T002, ...)
- [ ] Slugs are kebab-case and at most 30 characters
- [ ] `.orchestra/results/` directory exists and is empty

### Prompt-Derived Content
- [ ] "Express" appears in the project init task (framework choice)
- [ ] "TypeScript" appears in the project init task (language choice)
- [ ] "todo" or "task" appears in CRUD endpoint task objectives
- [ ] "authentication" or "auth" appears in auth-related task objectives
- [ ] Objectives are derived from the prompt — not hallucinated requirements beyond what the prompt implies
