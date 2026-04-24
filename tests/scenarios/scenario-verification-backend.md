# Scenario: Backend task verification

## Goal

Verify that backend tasks produce `test-output.txt` + `exit-code.txt` + `command.txt`, and that the Verifier correctly distinguishes a passing test run from a failing one.

## Setup

1. Sample project with Vitest, Jest, Pytest, or similar installed.

## Run (sub-case A — passing backend)

```
/orchestra run "Add POST /api/users that creates a user from {name, email, password}. Return 201 with the user (no password in response)."
```

## Expected outcome (A)

1. **Evidence produced:** `.orchestra/evidence/NNN-slug/` contains `test-output.txt` (showing passing tests), `exit-code.txt` (containing `0`), and `command.txt`.
2. **Verifier verdict:** `pass`. History entry shows `Verifier: T{id} verdict=pass`.
3. **Task state:** `status: done`, `verification_status: passed`.

## Run (sub-case B — failing backend that agent claimed passed)

Craft a scenario where the agent writes code that compiles but has a logic bug, and the agent's integration test is designed to catch that bug. The agent reports success based on its subjective impression but the test actually failed.

Easiest way: seed this by instructing the sample task to use a specific assertion that cannot be satisfied by the obvious implementation, then see whether the agent notices and retries vs. declares success regardless.

## Expected outcome (B)

1. **Evidence produced:** `test-output.txt` shows test failures, `exit-code.txt` contains a non-zero value.
2. **Verifier verdict:** `fail` with a reason citing the failed test assertion.
3. **Retry triggered** (if retries remain).
4. **Final state after retries:** either `verification_status: passed` (agent fixed the bug) or `verification_status: failed` (retries exhausted).

## Failure modes to catch

- Verifier returns `pass` despite non-zero exit code → verifier prompt not checking exit code properly.
- `exit-code.txt` missing from evidence → Evidence Requirements block not clear enough OR agent ignored it (retry should catch this).
