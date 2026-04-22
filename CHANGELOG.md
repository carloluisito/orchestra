# Changelog

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
