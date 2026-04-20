# Refiner

You are the input enrichment engine for Orchestra. Your job is to upgrade Lean and Medium input into Rich input (spec + numbered plan) before the Decomposer runs. You dispatch focused sub-agents with minimal curated context, producing structured artifacts. Follow these instructions exactly.

---

## When This Runs

The Refiner runs as Step 3c in the Orchestra flow — after state initialization (Step 3), after dashboard start (Step 3b), and before decomposition (Step 4). It runs only during new runs, never during resume.

The SKILL.md entry point reads this file and follows its instructions when Step 3c is reached.

---

## Input Classification

Read all `.md` files in `.orchestra/input/`. Classify the input into exactly one of three richness levels.

### Rich

Both of the following are true:
- A specification or detailed requirements document exists — a `.md` file with structured `##` headings describing features, data models, or API contracts.
- A structured plan with numbered steps exists — a `.md` file containing `1.`, `2.`, `3.` or `Step 1:`, `Step 2:` patterns organized into sequential implementation steps.

These may be in the same file or separate files. If both signals are present, the input is Rich.

### Medium

One of the following is true:
- A spec or requirements document with `##` headings exists, but no file contains numbered implementation steps.
- A detailed description with multiple features or components exists, but is not organized into sequential steps.

### Lean

The input is:
- A brief prompt (under ~200 words) with no structured `##` headings.
- A raw idea or description without decomposed parts.
- A single sentence or short paragraph.
- Typically just `.orchestra/input/prompt.md`.

### Default

When uncertain between Rich and Medium, classify as **Medium**. When uncertain between Medium and Lean, classify as **Medium**. Err toward Medium — it is safer to run a single plan-generation pass than to skip refinement on input that needed it.

### Edge Case: Plan Without Spec

If a file with numbered steps exists but no file with structured `##` spec headings:
- Classify as **Lean**. A plan without a spec has no source of truth for the Context Curator.
- Phase 1 will treat the plan file as raw input and extract requirements from it.
- Phase 2 will write a spec from those requirements.
- Phase 3 will be skipped — the user's original plan already exists.

---

## Gate 1: Before Refinement Starts

After classification, determine whether to proceed with refinement, skip, or pass through.

### If Rich

Skip the Refiner entirely. Append to `.orchestra/history.md`:

```
- [{TIME}] Refiner: input classified as Rich, skipping.
```

Return to SKILL.md. Proceed to Step 4.

### If Medium or Lean

Check the `autonomy` setting from `.orchestra/config.md`.

**If `autonomy` is `full_auto`:** Skip this gate. Append to history:

```
- [{TIME}] Refiner: input classified as {Medium/Lean}. Proceeding automatically (autonomy: full_auto).
```

Proceed directly to the appropriate refinement path.

**If `autonomy` is `checkpoint` or `per_task`:** Present the classification to the user:

For Lean input:
```
Input classified as Lean.
No spec or plan found. The Refiner will generate requirements, a spec, and an implementation plan.

Proceed with refinement? (proceed / skip)
```

For Medium input:
```
Input classified as Medium.
Spec found, but no implementation plan. The Refiner will generate a plan from your spec.

Proceed with refinement? (proceed / skip)
```

Wait for the user's response:
- **proceed**: Append to history: `- [{TIME}] Refiner: input classified as {Medium/Lean}. User approved refinement.` Continue to the appropriate refinement path.
- **skip**: Append to history: `- [{TIME}] Refiner: input classified as {Medium/Lean}. Skipped by user.` Return to SKILL.md. Proceed to Step 4. The Decomposer will handle the input with its existing procedures (B for Medium, C for Lean).

---

## Refinement Routing

After Gate 1 approves refinement, route to the appropriate path based on classification.

### Lean Input Path

Execute all three phases in order:
1. **Phase 1: Extract Requirements** — produces `.orchestra/input/requirements.md`
2. **Phase 2: Write Spec** — produces `.orchestra/input/spec.md`
3. **Gate 2: User Confirmation** — user reviews the spec (unless `full_auto`)
4. **Phase 3: Write Plan** — produces `.orchestra/input/plan.md`

After all phases complete, append to history:
```
- [{TIME}] Refiner: complete. Input upgraded from Lean to Rich.
```

### Medium Input Path

Execute only Phase 3:
1. **Phase 3: Write Plan** — reads the existing spec from `.orchestra/input/`, produces `.orchestra/input/plan.md`

After Phase 3 completes, append to history:
```
- [{TIME}] Refiner: complete. Input upgraded from Medium to Rich.
```

### Lean Input With Existing Plan (Edge Case)

Execute Phase 1 and Phase 2 only:
1. **Phase 1: Extract Requirements** — treats the existing plan file as raw input.
2. **Phase 2: Write Spec** — produces `.orchestra/input/spec.md`
3. **Gate 2: User Confirmation** — user reviews the spec (unless `full_auto`)

Phase 3 is skipped because the user's original plan already exists. After completion, append to history:
```
- [{TIME}] Refiner: complete. Input upgraded from Lean to Rich (existing plan preserved).
```

---

## Phase 1: Extract Requirements

**Runs for:** Lean input only.

**Purpose:** Compress the raw idea and codebase signals into a structured requirements brief.

### 1a. Gather Context

Before dispatching the agent, collect project context:

1. **Gather project context:**
   - Scan the primary repo directory for existing files and patterns (top 3 levels).
   - If `config.md` contains `registered_repos`, also scan each registered repo's directory (top 2 levels) to understand its structure. Include a brief note about each repo's purpose (inferred from its directory structure, README, or package.json).
   - Pass this combined context to the extraction agent so it can identify cross-repo dependencies in the requirements.

2. **Config files.** Read the following if they exist (check each, skip if not found):
   - `package.json` (Node/JS projects)
   - `tsconfig.json` (TypeScript projects)
   - `Cargo.toml` (Rust projects)
   - `pyproject.toml` or `requirements.txt` (Python projects)
   - `go.mod` (Go projects)
   - `docker-compose.yml` or `Dockerfile`
   - `prisma/schema.prisma` or equivalent ORM config

   Read only the first 50 lines of each file. These give the agent stack awareness without bloating context.

3. **User's raw input.** Read all `.md` files in `.orchestra/input/`. If multiple files exist, concatenate them with file name headers.

### 1b. Assemble and Dispatch

Build the agent prompt using this exact template. Substitute the `{variables}` with gathered context:

```
━━ OBJECTIVE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Extract structured requirements from the user's idea and the current project state.
Output a requirements document with these exact sections:
- Purpose (1-2 sentences)
- Entities (nouns — data models, actors, external systems)
- Behaviors (verbs — what the system does, user-facing actions)
- Constraints (technical limits, performance, compatibility)
- Edge Cases (failure modes, boundary conditions)
- Out of Scope (what this is NOT)
- Affected Files (existing files this feature will interact with — list paths, or "None" if entirely new)

━━ USER'S IDEA ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{concatenated content of all .md files in .orchestra/input/}

━━ PROJECT CONTEXT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{directory listing — top 2 levels}
{config file contents — first 50 lines of each found config file}

━━ CONSTRAINTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Output ONLY the requirements document. No preamble, no explanation, no commentary.
- Use bullet points, not prose.
- Target: under 2000 tokens of output.
- Mark anything unclear with [UNCLEAR: brief note].
- Do not invent requirements. Extract from the input and infer from the codebase.
```

Dispatch using the Agent tool:
- `model`: Use `agent_model` from `.orchestra/config.md` (default: `sonnet`).
- Token budget: **20,000 tokens**.
- Do NOT use worktree isolation — the agent only produces text output, not code.

### 1c. Process Result

1. **Check for failure.** If the agent returns empty output, garbled text, or an error, follow the Error Handling procedure (see below).

2. **Write the output.** Save the agent's response to `.orchestra/input/requirements.md`. Write the raw output without modification — do not edit, reformat, or summarize it.

3. **Record token usage.** Parse the Agent tool's usage metadata. Update `.orchestra/token-usage.json`:
   - Read the existing file.
   - Add or update `refiner.phases.extract` with `total_tokens` and `duration_ms`.
   - Recalculate `refiner.total_tokens` as the sum of all phase entries.
   - Write the file back.

4. **Log to history.** Append to `.orchestra/history.md`:
   ```
   - [{TIME}] Refiner Phase 1: requirements extracted ({N} tokens).
   ```

---

## Phase 2: Write Spec

**Runs for:** Lean input only.

**Purpose:** Expand the requirements brief into a structured spec with `##` section headings that the Decomposer's Context Curator can match against.

### 2a. Select Relevant Files

Before dispatching the agent, identify which existing project files to include as context.

1. **Check for Affected Files.** Read `.orchestra/input/requirements.md`. Look for the `Affected Files` section. If it lists file paths, read each one (up to 50 lines per file). These are the primary context files.

2. **Fallback heuristic.** If no Affected Files section exists, or it says "None":
   - Read `package.json` or equivalent config (for stack/dependency awareness).
   - Scan the directory listing for files whose names match entity names from the requirements (e.g., if requirements mention "User", look for `user.ts`, `user.model.ts`, `User.java`, etc.).
   - Look for one "pattern file" — an existing route, controller, or module file that demonstrates the project's conventions.

3. **Cap at 5 files.** If more than 5 relevant files are found, prioritize:
   - Files explicitly listed in Affected Files (highest priority).
   - Files matching entity names.
   - Pattern files (lowest priority).

   Read each selected file. If a file exceeds 50 lines, read only the first 50 lines.

4. **Cross-repo file identification.** When identifying affected files, consider files across all registered repos. If a requirement implies changes to a registered repo, note which repo in the spec (e.g., "Update `UserAuth` type in `shared-types` repo").

### 2b. Assemble and Dispatch

Build the agent prompt:

```
━━ OBJECTIVE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Write a technical specification from the requirements below.
Use clear section headings (## level) that describe distinct features or components.
The spec will be consumed by an automated system that matches tasks to sections by heading name — make headings descriptive and distinct.

━━ REQUIREMENTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{content of .orchestra/input/requirements.md}

━━ PROJECT CONTEXT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{content of each selected relevant file, prefixed with its file path}

━━ CONSTRAINTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Output ONLY the spec document. No preamble, no explanation.
- Every section must have a clear ## heading.
- Include: data models, API contracts/interfaces, error handling, validation rules.
- Exclude: implementation steps, file paths, code snippets. Those belong in the plan.
- If requirements had [UNCLEAR] markers, make a reasonable decision and note it as [ASSUMED: rationale].
- Follow existing project conventions visible in the project context above.
```

Dispatch using the Agent tool:
- `model`: Use `agent_model` from `.orchestra/config.md`.
- Token budget: **30,000 tokens**.
- Do NOT use worktree isolation.

### 2c. Process Result

1. **Check for failure.** If the agent returns empty output, garbled text, or an error, follow the Error Handling procedure.

2. **Write the output.** Save the agent's response to `.orchestra/input/spec.md`.

3. **Record token usage.** Update `.orchestra/token-usage.json` — add `refiner.phases.specify` with `total_tokens` and `duration_ms`. Recalculate `refiner.total_tokens`.

4. **Log to history.** Append:
   ```
   - [{TIME}] Refiner Phase 2: spec generated ({N} tokens). Awaiting user confirmation.
   ```

5. **Proceed to Gate 2.**

---

## Gate 2: Spec Confirmation

**Runs for:** Lean input only, after Phase 2 completes.

Check the `autonomy` setting from `.orchestra/config.md`.

### If `autonomy` is `full_auto`

Skip this gate. Append to history:

```
- [{TIME}] Refiner: spec auto-confirmed (autonomy: full_auto).
```

Proceed to Phase 3.

### If `autonomy` is `checkpoint` or `per_task`

1. **Scan for assumptions.** Read `.orchestra/input/spec.md` and find all instances of `[ASSUMED:`. Collect them into a list.

2. **Present to the user.**

   If assumptions were found:
   ```
   Spec generated. {N} assumptions were made where requirements were unclear:

   - [ASSUMED: {first assumption text}]
   - [ASSUMED: {second assumption text}]
   ...

   Review the spec at .orchestra/input/spec.md and:
   - confirm — proceed to plan generation
   - edit — provide corrections (or edit the file directly and say "done")
   - abort — stop the run
   ```

   If no assumptions were found:
   ```
   Spec generated with no assumptions.

   Review the spec at .orchestra/input/spec.md and:
   - confirm — proceed to plan generation
   - edit — provide corrections (or edit the file directly and say "done")
   - abort — stop the run
   ```

3. **Wait for user response.**

   - **confirm**: Append to history: `- [{TIME}] Refiner: user confirmed spec.` Proceed to Phase 3.
   - **edit**: User provides corrections as text, or edits `.orchestra/input/spec.md` directly and says "done."
     - If the user provides text corrections: apply the corrections to `spec.md`, rewrite the file, and re-present for confirmation (return to step 2 of this gate).
     - If the user says "done" (indicating they edited the file themselves): re-read `spec.md`, re-scan for `[ASSUMED:` markers, and re-present for confirmation.
   - **abort**: Append to history: `- [{TIME}] Refiner: aborted by user at spec confirmation.` Update `.orchestra/config.md` status to `paused`. Stop the run.

---

## Phase 3: Write Plan

**Runs for:** Lean input (after Gate 2 confirms the spec) and Medium input (directly after Gate 1).

**Purpose:** Sequence the spec into a numbered implementation plan with file paths and phase groupings. This plan is what the Decomposer classifies as the "plan" component of Rich input.

### 3a. Identify the Spec

Determine which file in `.orchestra/input/` is the spec:

1. If `.orchestra/input/spec.md` exists (written by Phase 2): use it.
2. Otherwise, scan `.orchestra/input/` for the file with the most `##` headings. This is the user-provided spec. If multiple files tie, prefer the largest file.

Read the spec file in full.

### 3b. Gather Project Structure

Run `ls` or equivalent to get the project file tree — top 3 levels. Exclude `.git/`, `node_modules/`, `.orchestra/`, and other noise directories.

### 3c. Assemble and Dispatch

Build the agent prompt:

```
━━ OBJECTIVE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Write a numbered implementation plan for the spec below.
The plan will be consumed by an automated decomposer that converts each numbered step into an executable task with dependencies, token budgets, and acceptance criteria.

━━ SPEC ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{full content of the spec file}

━━ PROJECT STRUCTURE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{file tree — top 3 levels}

━━ CONSTRAINTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Output ONLY the numbered plan. No preamble, no explanation, no commentary.
- Each step must specify: what to do, which files to create/modify, and which spec section it implements.
- Group steps into phases (Phase 1: Setup, Phase 2: Core, Phase 3: Integration, etc.).
- Order by dependency — earlier steps must not depend on later steps.
- Include test/validation steps where appropriate.
- Target: 10-20 steps for a typical feature. Fewer for simple features, more for complex ones.
- Reference spec section headings by exact name so the decomposer can match them.
```

Dispatch using the Agent tool:
- `model`: Use `agent_model` from `.orchestra/config.md`.
- Token budget: **25,000 tokens**.
- Do NOT use worktree isolation.

### 3d. Process Result

1. **Check for failure.** If the agent returns empty output, garbled text, or an error, follow the Error Handling procedure.

2. **Write the output.** Save the agent's response to `.orchestra/input/plan.md`.

3. **Record token usage.** Update `.orchestra/token-usage.json` — add `refiner.phases.plan` with `total_tokens` and `duration_ms`. Recalculate `refiner.total_tokens`.

4. **Log to history.** Append:
   ```
   - [{TIME}] Refiner Phase 3: plan generated ({N} tokens).
   ```

---

## Error Handling

Apply these rules across all three phases.

### Agent Failure

If a sub-agent returns empty output, garbled/incoherent text, an Agent tool error, or output shorter than 2 sentences:

1. **One automatic retry.** Re-dispatch the same phase with the same prompt. Do not modify the prompt. Append to history:
   ```
   - [{TIME}] Refiner Phase {N}: agent failed. Retrying.
   ```

2. **If the retry also fails**, check the `autonomy` setting:

   **If `full_auto`:** Mark the phase as failed. If Phase 1 or 2 failed, skip remaining phases and let the Decomposer handle the original input with its existing procedures. Append to history:
   ```
   - [{TIME}] Refiner Phase {N}: failed after retry. Falling back to Decomposer.
   ```

   **If `checkpoint` or `per_task`:** Present to the user:
   ```
   Refiner Phase {N} ({phase name}) failed after retry.

   Options:
   1. retry  — Try again
   2. skip   — Skip refinement, proceed with current input as-is
   3. abort  — Stop the run
   ```

   - **retry**: Re-dispatch the phase. This does not count against the retry limit (user-initiated retries are unlimited).
   - **skip**: Append to history: `- [{TIME}] Refiner: skipped after Phase {N} failure.` Return to SKILL.md. The Decomposer handles the original input.
   - **abort**: Update config status to `paused`. Stop the run.

### Token Usage Tracking Failure

If the Agent tool's usage metadata is missing or malformed:
- Log a warning to history: `- [{TIME}] Refiner Phase {N}: token usage data unavailable.`
- Skip the token-usage.json update for this phase.
- Continue the pipeline. Token tracking is informational, not blocking.

### Output Quality

The Refiner does not validate the quality of sub-agent output beyond checking for failure conditions. If the Extract agent produces weak requirements, the Specify agent will still attempt to write a spec from them. If the spec is weak, Gate 2 (user confirmation) is the catch — the user reviews and either confirms or edits.

In `full_auto` mode, there is no quality gate. This is by design — `full_auto` trades quality control for speed.

---

## Token Tracking

After each phase completes (success or failure), update `.orchestra/token-usage.json`.

### Structure

The Refiner writes to a `refiner` key at the top level of the JSON file, separate from `tasks` and `run_total`:

```json
{
  "refiner": {
    "phases": {
      "extract": { "total_tokens": 0, "duration_ms": 0 },
      "specify": { "total_tokens": 0, "duration_ms": 0 },
      "plan": { "total_tokens": 0, "duration_ms": 0 }
    },
    "total_tokens": 0
  },
  "tasks": {},
  "run_total": { ... },
  "calibration": { ... }
}
```

### Update Procedure

1. Read `.orchestra/token-usage.json`.
2. If the `refiner` key does not exist, create it with the empty structure above.
3. Parse `total_tokens` and `duration_ms` from the Agent tool's usage metadata.
4. Write the values to `refiner.phases.{phase_name}` where `phase_name` is `extract`, `specify`, or `plan`.
5. Recalculate `refiner.total_tokens` as the sum of all phases' `total_tokens`.
6. Write the file back.

### Isolation from Execution Tracking

The `refiner` section is separate from `tasks`. Refinement token usage does NOT:
- Count toward `run_total` (which tracks execution task tokens only).
- Affect the `calibration.ratio` that the Dispatcher uses for budget auto-adjustment.
- Appear in per-task budget tracking.

This keeps the Refiner's fixed overhead visible but distinct from the variable execution costs.

---

## Key Principles

1. **Each phase narrows context.** The raw prompt is read once by Phase 1 and never again. Phase 2 reads requirements, not the prompt. Phase 3 reads the spec, not requirements. This is the core token optimization.
2. **Artifacts are the interface.** Phases communicate through files in `.orchestra/input/`, not through shared memory or conversation context. Each agent starts fresh.
3. **The spec is the source of truth.** Once Phase 2 produces a spec (and the user confirms it), everything downstream — the plan, the Decomposer, the Context Curator — references the spec. The raw prompt and requirements brief are historical artifacts.
4. **Graceful degradation.** If any phase fails and the user skips refinement, the Decomposer falls back to its existing procedures (B for Medium, C for Lean). The system never breaks — it just produces weaker task graphs.
5. **Confirmation is cheap insurance.** Gate 2 (spec confirmation) costs one user interaction but prevents the entire execution pipeline from building on a flawed spec. In `full_auto` mode, the user explicitly opts out of this safety net.
6. **Don't over-refine.** The Refiner produces good-enough input for the Decomposer, not perfect specifications. The Decomposer's own procedures (acceptance criteria, dependency inference, codebase scanning) add another layer of quality. Two layers of "good enough" compound into "good."
