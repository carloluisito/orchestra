# Scenario: NOT_APPLICABLE handling

## Goal

Verify two sub-cases:
- (A) A task the Decomposer correctly marked `evidence: false` flows through without invoking the Verifier, gets `verification_status: n/a`.
- (B) A code task where the agent emits `EVIDENCE: NOT_APPLICABLE` with a weak justification is rejected by the Verifier and forced to retry.

## Run (sub-case A — legitimately not testable)

```
/orchestra run "Update the project README with a section describing the API authentication flow."
```

## Expected outcome (A)

1. **Decomposer:** at least one task in `.orchestra/tasks/` has `evidence: false` (the README-editing task).
2. **Work agent:** produces the README change. Does NOT write to `.orchestra/evidence/`.
3. **Dispatcher:** sees `evidence: false`, skips Verifier, goes directly to Result Collector.
4. **Task state:** `status: done`, `verification_status: n/a`.
5. **No Verifier history entry** for this task.

## Run (sub-case B — agent abuses NOT_APPLICABLE)

This requires seeding the scenario with a UI task where the agent is instructed (by a test-injected prompt override) to declare NOT_APPLICABLE. Alternatively, inspect a real failed run after the feature ships.

Simpler setup: manually craft a task file with `evidence: true` and a clearly testable UI objective, and place a mock agent response starting with `EVIDENCE: NOT_APPLICABLE — complex to test` into `.orchestra/results/NNN-slug.log`. Invoke just the Verifier stage.

## Expected outcome (B)

1. **Verifier detects NOT_APPLICABLE** and takes the NOT_APPLICABLE evaluation path (Verifier prompt variant).
2. **Verifier rejects the justification** because the task has obvious testable behavior (a rendered page).
3. **Verdict: fail** with a reason citing what could have been tested.
4. **Retry triggered** (if retries remain).

## Failure modes to catch

- Decomposer marks `evidence: true` on a pure-docs task → wrong default / rule too permissive.
- Verifier accepts any NOT_APPLICABLE justification without evaluating → verifier prompt for NOT_APPLICABLE variant broken.
- Sub-case A still runs the Verifier → Dispatcher `evidence: false` short-circuit broken.
