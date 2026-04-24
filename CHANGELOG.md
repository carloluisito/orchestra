# Changelog

## [1.1.1] - 2026-04-25

### Fixed
- **Resume no longer leaves the dashboard badge stuck on `paused`.** The Resume Flow now explicitly calls State Manager Operation 6 to flip `config.md#status` from `paused` back to `running` before entering the dispatch loop. Operation 6's trigger description was also expanded to list resume as a valid caller. (SKILL.md, state-manager.md)
- **Per-batch state drift eliminated via new State Manager Operation 7 (Post-Batch Sync).** The Dispatcher's Step 9 previously called Operation 4 directly and relied on the orchestrator to also update `token-usage.json`, append a batch summary to `history.md`, and clean up heartbeats. Orchestrators routinely skipped those follow-ups, leaving `dag.md` counters frozen ("N / 225 tasks complete" not advancing) and per-task token bars stuck at `0 / 80k`. Operation 7 consolidates all four post-batch duties into a single mandatory call site. (dispatcher.md, state-manager.md)
- **In-flight tasks now emit a live heartbeat.** The Dispatcher writes `.orchestra/running/{TASK_ID}.json` at dispatch time (with `started_at`, `agent_id`, `model`, `worktree_path`, `wave`); the Result Collector deletes it on any terminal status; Operation 7 sweeps orphans as a crash safety net. The dashboard can now show "running for Xm" and an accurate parallel-count badge instead of 0% → done jumps. (dispatcher.md, result-collector.md, state-manager.md)
- **Resume sweeps orphan heartbeats.** State Manager Operation 2 Step 4b now scans `.orchestra/running/*.json` after reconciling interrupted tasks and deletes any heartbeat whose task is no longer `running`. Prevents ghost in-flight tasks from appearing on the dashboard immediately after `/orchestra resume`. (state-manager.md)

### Added
- `.orchestra/running/` directory. Created by Operation 1 alongside `tasks/` and `results/`. Holds one JSON heartbeat file per in-flight task.
- State Manager Operation 7: Post-Batch Sync. Documented as the only sanctioned way to close out a dispatch batch.

## [1.1.0] - 2026-04-23

### Added
- Verifier step for evidence-based task validation. Tasks marked `evidence: true` now dispatch a fresh independent sub-agent that validates the work agent's artifacts (screenshots, test output, exit codes, build output) against acceptance criteria before proceeding. The verdict decides whether to continue, retry with feedback, or escalate.

### Changed
- README updated to document the verifier step in the orchestration flow.

## [1.0.0] - 2026-04-20

### Added
- Initial release of Orchestra: context-optimized task orchestration plugin for Claude Code.
- DAG-based task decomposition with explicit dependencies.
- Context curation per sub-agent within configurable token budgets.
- Parallel dispatch with optional git worktree isolation.
- PostToolUse hook for token tracking.
- Optional dashboard for visualizing runs and token usage.
- `/orchestra run|resume|status` command surface.
