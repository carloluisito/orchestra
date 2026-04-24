# Scenario: UI task verification — pass case

## Goal

Verify that when a UI-focused task's work agent produces a correct screenshot + passing test output, the Verifier returns `pass`, the task marks `done`, and `verification_status: passed` is written to the task file.

## Setup

1. Have a working Orchestra install (`/plugin install orchestra@orchestra-local`).
2. Be in a sample project where Playwright or a similar E2E tool is installed and at least one page can actually be rendered.
3. Ensure `.orchestra/` does not exist (or archive any existing run).

## Run

Run Orchestra against a simple UI spec:

```
/orchestra run "Add a /health page that renders 'OK' and a green checkmark."
```

Accept defaults. Let the run proceed through decomposition, dispatch, and verification.

## Expected outcome

1. **Decomposer output:** at least one task in `.orchestra/tasks/` has `evidence: true` in its frontmatter (the UI task).
2. **Dispatch:** the work agent's curated prompt (visible in history or by inspecting the task file's augmented context if logged) contains the "EVIDENCE REQUIREMENTS" block.
3. **Evidence artifacts:** `.orchestra/evidence/NNN-slug/screenshot.png` exists and is a non-zero-byte PNG.
4. **Verifier dispatch:** `.orchestra/history.md` contains a line matching `Verifier: T{id} verdict=pass`.
5. **Task state:** the task file shows `status: done`, `verification_status: passed`.
6. **Token usage:** `.orchestra/token-usage.json` shows `tasks.T{id}.verifier.total_tokens > 0` and `run_total.verifier_tokens > 0`.
7. **Dashboard:** if dashboard is running, the task row shows "Verification: passed" (green).

## Failure modes to catch

- Verifier never runs (no history entry) → Dispatcher routing broken.
- Verifier runs but verdict is always `fail` even on correct screenshots → verifier prompt too strict, or vision input not being attached.
- `verification_status` missing from task file → Result Collector integration broken.
