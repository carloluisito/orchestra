---
name: orchestra
description: "Context-optimized task orchestration - decomposes complex tasks into a DAG and dispatches focused sub-agents with minimal context prompts. Use /orchestra run, /orchestra resume, or /orchestra status."
---

# Orchestra

You are the main entry point for the Orchestra skill. Your job is to parse the user's command, route to the correct flow, and coordinate the execution pipeline by reading component files on demand. Follow these instructions exactly.

---

## Command Routing

Parse the user's input after `/orchestra` to determine which flow to execute.

| Input | Flow |
|---|---|
| `run <input>` | **New Run** — full pipeline from input to completion |
| `resume` | **Resume** — pick up where a previous run left off |
| `status` | **Status** — read-only view of current run state |
| *(no subcommand)* | **Help** — show usage information |

If the input does not match any of the above, show the Help output and ask the user to clarify.

---

## Help Output

When the user invokes `/orchestra` with no subcommand (or an unrecognized one), display:

```
Orchestra — context-optimized task orchestration

Commands:
  /orchestra run <input>    Start a new orchestration run
  /orchestra resume         Resume a paused or interrupted run
  /orchestra status         Show current run progress (read-only)

Input formats for "run":
  /orchestra run spec.md                  Single file
  /orchestra run spec.md plan.md          Multiple files
  /orchestra run "Build a REST API..."    Quoted prompt
  /orchestra run ./docs/                  Directory (scans for .md files)

Cross-repository:
  /orchestra run "Add auth" --repos service-b,shared-types

  The repo you invoke from is the primary repo.
  --repos lists additional sibling repos by directory name.
  Paths are resolved relative to the parent of the primary repo (../).

Options (configured interactively after "run"):
  token_budget   Target context budget per agent      (default: 80000)
  autonomy       full_auto / checkpoint / per_task    (default: checkpoint)
  max_parallel   Max concurrent sub-agents            (default: 3)
  max_retries    Retry attempts per failed task        (default: 2)
  agent_model    sonnet / opus / haiku                 (default: sonnet)
  use_worktrees  Git worktree isolation per agent      (default: true)
```

---

## New Run Flow

Execute this flow when the user runs `/orchestra run <input>`.

### Step 1: Validate Input

1. **Check for existing run.** If `.orchestra/` already exists:
   - Warn the user that a previous run exists.
   - Offer two options:
     - **Resume** — switch to the Resume Flow instead.
     - **Archive** — rename the existing directory to `.orchestra-archived-{timestamp}/` (use ISO 8601 timestamp, e.g., `20260414T093000`) and proceed with a fresh run.
   - Wait for the user's choice before continuing. Never delete or overwrite without confirmation.

2. **Parse input.** Determine what the user provided:
   - **File path** — verify the file exists. If it does not, report the error and stop.
   - **Multiple file paths** — verify each file exists. Report any missing files and stop.
   - **Quoted string** — treat as a raw prompt. No file verification needed.
   - **Directory path** — scan for `.md` files in the directory. If none are found, report the error and stop.

3. **Parse `--repos` flag.** Check if the input contains `--repos <comma-separated-list>`. If present:
   - Split the value by commas to get a list of repo directory names.
   - For each name, resolve the path as `../{name}` relative to the current working directory's git root.
   - Verify each resolved path exists and is a git repository (contains a `.git` directory or file). If any path does not exist or is not a git repo, report the error: "`{name}` not found as a sibling repository at `{resolved_path}`." Stop.
   - Store the validated repo list for use in Step 2b.
   - Remove the `--repos` flag and its value from the input before continuing to parse the remaining input as file paths or a prompt.

4. **Confirm.** Present what was found (file names, prompt preview, or list of scanned files). If `--repos` was provided, also show: "Additional repositories: {comma-separated list with resolved paths}." Confirm the user is ready to proceed.

### Step 2: Configure

Ask the user for preferences, or accept defaults. Present the configuration options:

| Setting | Default | Options |
|---|---|---|
| `token_budget` | `80000` | Any positive integer |
| `autonomy` | `checkpoint` | `full_auto`, `checkpoint`, `per_task` |
| `max_parallel` | `3` | Any positive integer |
| `max_retries` | `2` | Any non-negative integer |
| `agent_model` | `sonnet` | `sonnet`, `opus`, `haiku` |
| `use_worktrees` | `true` | `true`, `false` |

If the user responds with "yes", "y", or presses enter, accept all defaults. Otherwise, apply the values they specify and use defaults for anything they omit.

### Step 2b: Branch Setup

After configuration, prompt the user for branch details. This applies to ALL runs (single-repo and multi-repo).

1. **Branch name.** Suggest a branch name derived from the input (e.g., `feat/implement-user-auth`). Ask:
   > "Suggested branch name: `{suggested_name}`. Use this or enter your own:"
   If the user presses enter or says "yes", use the suggestion. Otherwise, use what they provide.

2. **Base branch.** Ask:
   > "Which branch should this be based on? (default: `main`)"
   If the user presses enter or says "yes" or provides no value, use `main`. Otherwise, use what they provide.

3. **Per-repo base branch (multi-repo only).** If `--repos` was provided in Step 1, ask whether all repos share the same base branch or need per-repo overrides:
   > "Base branch for each repo:
   > - **{primary_repo}** (primary): `{base_branch}`
   > - **{repo_name}**: `{base_branch}`
   > - **{repo_name}**: `{base_branch}`
   >
   > All the same, or adjust per repo?"
   If the user says "same" or presses enter, apply the same base branch to all repos. Otherwise, parse their per-repo overrides.

4. **Store values.** Pass the `branch_name`, `branch_base`, and per-repo base branches (if any) to the State Manager for inclusion in `config.md`.

### Step 2c: Dirty Repo Check

Before initializing state, check all repositories for uncommitted changes.

1. **Check primary repo.** Run `git status --porcelain` in the current working directory. If output is non-empty, the repo has uncommitted changes.

2. **Check registered repos.** For each repo in the `--repos` list, run `git -C {repo_path} status --porcelain`. If output is non-empty, that repo has uncommitted changes.

3. **For each dirty repo**, prompt the user:
   > "**{repo_name}** has uncommitted changes. Stash them before proceeding? (y/n)"
   - If **yes**: run `git -C {repo_path} stash push -m "orchestra-auto-stash: pre-run {branch_name}"`. Record that this repo was stashed so the run summary can remind the user later.
   - If **no**: abort the run with message: "Cannot proceed with uncommitted changes in {repo_name}. Please commit or stash your changes manually and re-run."

### Step 2d: Collect Project Conventions

Before initializing state, collect project conventions from all available sources so sub-agents can follow project standards. Sub-agents do not auto-load CLAUDE.md or settings rules — this step extracts them once and makes them available to the Context Curator.

1. **Read convention sources.** For the primary repo, read these files if they exist:
   - `CLAUDE.md` at the repo root.
   - `.claude/settings.json` — extract the `rules` array.
   - `.claude/settings.local.json` — extract the `rules` array.

   For multi-repo runs, also read the same files from each registered repo's root directory.

2. **Filter to code-relevant rules.** From all collected content, keep ONLY rules that affect code output:
   - Naming conventions (casing, prefixes, file naming).
   - Import/module patterns.
   - Testing rules (framework, patterns, coverage expectations).
   - Architectural constraints ("don't use X library", "always use Y for Z").
   - Code style rules (formatting, error handling patterns).
   - Language/framework-specific conventions.

   Filter OUT rules that are about interaction or session behavior:
   - Interaction preferences ("explain your reasoning", "be concise", "ask before X").
   - Permission/tool rules ("allow npm commands", "deny file deletion").
   - Session behavior rules ("use this model", "always commit").

3. **Write condensed output.** Write the filtered conventions to `.orchestra/project-conventions.md`.
   - Target size: under 2000 characters (~500 tokens). If the output exceeds this, summarize further — bullet points, no prose.
   - For multi-repo runs where repos have different conventions, organize by repo:
     ```markdown
     ## All Repos
     - (shared conventions)

     ## service-a
     - (service-a specific)

     ## shared-types
     - (shared-types specific)
     ```
   - If all conventions are shared across repos, omit per-repo sections.

4. **Handle no conventions found.** If no CLAUDE.md exists and no `rules` arrays are found in any settings file, skip creating the file. Record `conventions_collected: false` for the config. Proceed to Step 3.

5. **Record in config.** If conventions were collected, record `conventions_collected: true` for the config (this value will be substituted into `config.md` during Step 3).

### Step 3: Initialize State

Read `skills/orchestra/state-manager.md` and follow its **"Operation 1: Initialize a New Run"** instructions. This will:
- Create the `.orchestra/` directory structure.
- Generate `config.md` from the template with the user's configuration.
- Copy the input source into `.orchestra/input/`.
- Generate `history.md` from the template.

### Step 3b: Start Dashboard

1. Start the dashboard server:
   - On Windows (detected by `$OSTYPE` containing `msys`, `cygwin`, or `mingw`): run with `run_in_background: true` on the Bash tool:
     ```bash
     bash scripts/start-dashboard.sh --orchestra-dir .orchestra
     ```
   - On macOS/Linux: run normally (the script backgrounds itself):
     ```bash
     bash scripts/start-dashboard.sh --orchestra-dir .orchestra
     ```
2. Read `.orchestra/dashboard-info.json` for the URL.
3. Tell the user: "Dashboard running at {url} — open it in your browser to monitor progress."
4. If the server fails to start, warn the user but continue — the dashboard is optional, not required for orchestration.

### Step 3c: Refine Input

Read `skills/orchestra/refiner.md` and follow its instructions. The Refiner will:
1. Classify the input in `.orchestra/input/` as Rich, Medium, or Lean.
2. If Rich — skip and proceed to Step 4.
3. If Medium or Lean — present the classification and ask the user whether to proceed with refinement or skip (respecting the `autonomy` setting from config).
4. If proceeding, run the appropriate refinement phases and write enriched artifacts to `.orchestra/input/`.
5. After refinement (or skip), proceed to Step 4.

### Step 4: Decompose

Read `skills/orchestra/decomposer.md` and follow its full decomposition process:
1. Classify the input richness (Rich / Medium / Lean).
2. Run the appropriate decomposition procedure (A, B, or C).
3. Generate task files in `.orchestra/tasks/`.
4. Generate `.orchestra/dag.md` with the wave structure.

After decomposition, present the DAG to the user for review — show the task list with IDs, titles, dependencies, and wave assignments. If the user's autonomy setting is `full_auto`, skip the review and proceed directly. Otherwise, wait for the user to confirm or request changes before continuing.

### Step 5: Dispatch Loop

Read `skills/orchestra/dispatcher.md` and enter its execution loop. The Dispatcher will:
- Read state, find ready tasks, enforce autonomy gates, and dispatch sub-agents.
- Internally read `skills/orchestra/context-curator.md` when assembling agent prompts.
- Internally read `skills/orchestra/result-collector.md` when processing agent output.
- For tasks marked with `fallback: true` or tasks that fail after max retries, read `skills/orchestra/fallback-engine.md` and follow its recovery procedures.

Continue the dispatch loop until all tasks reach `done` or the run is halted.

### Step 6: Completion

When the dispatch loop exits:
1. **Present a final summary.** Read all completed task files from `.orchestra/tasks/` and `config.md`.

   **For single-repo runs** (no `registered_repos` in config), present the existing summary format:
   - Tasks completed vs. total (e.g., `12/12 tasks completed`).
   - Any failed tasks and their failure reasons.
   - Total elapsed time (from run start to now).

   **For multi-repo runs** (config has `registered_repos`), present a per-repo breakdown:
   ```
   ## Run Complete: {branch_name}

   ### {primary_repo} (primary)
   - Task {ID}: {title} [{status}]
   - ...
   - Branch: {branch_name} (based on {branch_base})

   ### {registered_repo_name}
   - Task {ID}: {title} [{status}]
   - ...
   - Branch: {branch_name} (based on {repo_branch_base})
   ```

   For registered repos that had no tasks dispatched to them:
   ```
   ### {registered_repo_name}
   - No tasks dispatched (registered but unused)
   - No branch created
   ```

   **Flagged repos:** If any tasks during the run flagged unregistered repos as potentially needing changes (notes from the Decomposer), include a Flagged section:
   ```
   ### Flagged
   - {repo_name} may need updates (discovered during Task {ID}, not in registered repos)
   ```

   **Stash reminder:** If `config.md` has a `stashed_repos` section, append:
   ```
   **Reminder:** The following repos had changes stashed before this run:
   - {repo_name}: `orchestra-auto-stash: pre-run {branch_name}`
   Use `git -C {repo_path} stash pop` to restore your previous work.
   ```

2. **Update state.** Write a completion entry to `.orchestra/history.md` and set the run status in `.orchestra/config.md` to `completed` (or `completed_with_failures` if any tasks failed).
3. **Stop the dashboard server.**
   ```bash
   bash scripts/stop-dashboard.sh .orchestra
   ```
   The dashboard will show the final "Run complete" state and remain viewable (the HTML is static once loaded). The server process exits.

---

## Resume Flow

Execute this flow when the user runs `/orchestra resume`.

1. **Check for existing run.** If `.orchestra/` does not exist, report the error: "No active Orchestra run found. Use `/orchestra run <input>` to start a new run." Stop.

2. **Read state.** Read `skills/orchestra/state-manager.md` and follow its **"Operation 2: Read State for Resume"** instructions. This loads the full run state from disk.

3. **Start Dashboard.** Before entering the dispatch loop, start the dashboard server following the same steps as New Run Step 3b. If `.orchestra/dashboard-info.json` already exists from a previous session, the start script will kill the old server first.

4. **Present status.** Show the user:
   - Overall progress (e.g., `7/12 tasks completed`).
   - Last 5 entries from `.orchestra/history.md`.
   - Tasks that are currently ready for dispatch (status `pending` with all dependencies `done`).

5. **Confirm.** Ask the user if they want to resume execution. If they confirm, proceed to **Step 5: Dispatch Loop** (same as New Run). If they decline, stop.

---

## Status Flow

Execute this flow when the user runs `/orchestra status`.

1. **Check for existing run.** If `.orchestra/` does not exist, report: "No active Orchestra run found." Stop.

2. **Read state.** Read all task files from `.orchestra/tasks/*.md` and `.orchestra/dag.md`. Parse each task's frontmatter for `id`, `title`, `status`, and `depends_on`.

3. **Present status.** Display using this format:
   - Run configuration summary (from `.orchestra/config.md`).
   - Progress bar or fraction (e.g., `7/12 tasks completed`).
   - Per-wave breakdown showing each task's ID, title, and status.
   - Any blocked or failed tasks with reasons.

4. **Stop.** This flow is read-only. Do NOT enter the dispatch loop or modify any state.

---

## Error Recovery

Follow these principles when errors occur:

- **Report clearly.** Always tell the user what went wrong and where.
- **Never crash silently.** If an operation fails, surface the error immediately.
- **Suggest corrective actions.** For each error, recommend what the user can do (e.g., "File not found — check the path and try again").
- **Never delete or overwrite without confirmation.** Always ask before destructive operations.
- **Preserve state on failure.** If the dispatch loop hits an unrecoverable error, ensure all progress so far is written to disk before stopping.
- **Stop the dashboard on abort.** When halting due to an unrecoverable error, stop the dashboard server:
  ```bash
  bash scripts/stop-dashboard.sh .orchestra
  ```

---

## Component Reference

These are the component files that this skill reads on demand during execution. Each is a standalone instruction document — read it when you need it, follow its instructions, then return here.

| Component | File | When to Read |
|---|---|---|
| State Manager | `skills/orchestra/state-manager.md` | Initializing a run, reading state for resume, any state read/write |
| Decomposer | `skills/orchestra/decomposer.md` | Step 4 of New Run — breaking input into a task DAG |
| Context Curator | `skills/orchestra/context-curator.md` | During dispatch — assembling focused prompts for sub-agents |
| Dispatcher | `skills/orchestra/dispatcher.md` | Step 5 of New Run or Resume — the main execution loop |
| Result Collector | `skills/orchestra/result-collector.md` | After each sub-agent returns — processing and recording results |
| Fallback Engine | `skills/orchestra/fallback-engine.md` | When a task has `fallback: true` or fails after max retries |
| Refiner | `skills/orchestra/refiner.md` | Step 3c of New Run — classifying and enriching input before decomposition |
