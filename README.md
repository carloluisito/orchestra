# Orchestra

Context-optimized task orchestration for Claude Code. Keeps sub-agent output quality high by decomposing complex work into a DAG of focused subtasks, each dispatched with a curated, minimal-context prompt.

## The Problem

As context grows larger, output degrades. Typical agent systems stuff full specs, plans, and codebases into every sub-agent — most of it irrelevant to the task at hand. Quality drops, tokens are wasted, and failures compound.

## The Solution

Orchestra breaks work into atomic tasks with explicit dependencies. Each sub-agent receives only:

- The specific objective
- Relevant spec sections
- Upstream task summaries
- Files to touch

…all within a configurable token budget. Independent tasks run in parallel, results are summarized for downstream consumers, and progress is tracked in `.orchestra/` inside your project.

## Requirements

- Claude Code (latest)
- Node.js (for the PostToolUse token-tracking hook and the optional dashboard)
- Git (worktree isolation is on by default)

## Installation

Install via Claude Code's marketplace system. From any project, run:

```
/plugin marketplace add carloluisito/orchestra
/plugin install orchestra@orchestra-local
```

The plugin registers one skill (`orchestra`), one PostToolUse hook (token tracking), and the `/orchestra ...` command pattern.

## Quick Start

```
/orchestra run path/to/spec.md               # Run from a spec file
/orchestra run spec.md plan.md               # Spec + plan
/orchestra run "Build a REST API for ..."    # Raw prompt
/orchestra run ./docs/                       # Directory (scans .md files)
/orchestra run "Add auth" --repos service-b  # Cross-repo orchestration
/orchestra resume                            # Resume the last run
/orchestra status                            # Read-only view of progress
```

After `run`, Orchestra will prompt you interactively for configuration and branch setup before execution begins.

## Configuration

| Setting        | Default      | Description                                                  |
|----------------|--------------|--------------------------------------------------------------|
| `token_budget` | `80000`      | Target max tokens per sub-agent prompt                       |
| `autonomy`     | `checkpoint` | `full_auto`, `checkpoint`, or `per_task`                     |
| `max_parallel` | `3`          | Max concurrent sub-agents                                    |
| `max_retries`  | `2`          | Retry attempts per failed task                               |
| `agent_model`  | `sonnet`     | Model for sub-agents (`sonnet`, `opus`, `haiku`)             |
| `use_worktrees`| `true`       | Git worktree isolation per agent                             |

## How It Works

1. **Decompose** — input is broken into atomic tasks with dependency edges (a DAG).
2. **Curate** — each task gets a focused prompt assembled from only the context it needs, within budget.
3. **Dispatch** — independent tasks run as parallel sub-agents (optionally in isolated git worktrees).
4. **Collect** — results are captured and summarized for downstream consumers.
5. **Repeat** — until the DAG completes, with checkpoints for review if enabled.

## Runtime State

Orchestra creates a `.orchestra/` directory in your project to store DAG state, per-task artifacts, token usage, and run history. This directory is gitignored by convention — add `.orchestra/` to your `.gitignore` if you haven't.

## Dashboard (Optional)

A lightweight dashboard is included for visualizing active runs and token usage:

```
./skills/orchestra/scripts/start-dashboard.sh
./skills/orchestra/scripts/stop-dashboard.sh
```

## Cross-Repository Orchestration

Pass `--repos repo-a,repo-b` to coordinate changes across sibling repositories. Paths are resolved relative to the parent of your current repo.

## License

MIT

## Author

Carlo — https://github.com/carloluisito/orchestra
