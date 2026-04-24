# Scenario: Typed-language build failure

## Goal

Verify that the Verifier correctly catches the case where a task adds a statically-typed source file, runtime tests pass, but the project's typecheck/build command fails. This is the specific gap the user reported: tests passed via vitest, but `npm run build` would have caught a type error.

## Setup

1. Sample TypeScript project with Vitest and `tsc --noEmit` (or `npm run build`) both runnable.
2. Orchestra installed and pointing at the local plugin path.

## Run

```
/orchestra run "Add a TypeScript input-validator module with unit tests."
```

Accept defaults. The decomposer should mark this task `evidence: true`. The agent will run tests and build.

## Expected outcome

1. **Evidence produced:** `.orchestra/evidence/NNN-slug/` contains both `test-output.txt` (passing tests) AND `build-output.txt` + `build-exit-code.txt` (from the `tsc` / `npm run build` command).
2. **If the agent's implementation has type errors:** `build-exit-code.txt` contains a non-zero value. Verifier verdict is `fail`, reason cites the type errors from `build-output.txt`. Retry is triggered.
3. **If the agent's implementation is clean:** Both exit codes are 0. Verifier verdict is `pass`.

## Failure modes to catch

- Agent skips `npm run build` entirely → `build-output.txt` missing → verifier catches via "missing build evidence".
- Agent runs build, sees failure, tries to hide it by omitting `build-exit-code.txt` → verifier catches via "build evidence incomplete".
- Verifier returns `pass` despite non-zero `build-exit-code.txt` → verifier prompt not respecting the build-exit-code rule (this is what this scenario guards against).
