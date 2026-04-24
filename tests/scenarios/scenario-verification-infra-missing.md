# Scenario: Infrastructure missing (Case F)

## Goal

Verify that when the work agent cannot install verification infrastructure (Playwright, test runner, etc.), Orchestra pauses the run and asks the user — regardless of autonomy mode.

## Setup

1. Sample project with NO E2E test framework installed (no Playwright, no Puppeteer, no Cypress).
2. Environment where `npm install` cannot succeed (e.g., offline sandbox, or a test-only flag that tells Orchestra to skip installs).

## Run

```
/orchestra run "Add a /contact page with a form." autonomy=full_auto
```

Set autonomy to `full_auto` explicitly to confirm the pause-for-user behavior overrides it.

## Expected outcome

1. Work agent attempts to install Playwright. Install fails.
2. Work agent reports `scope_conflict` or explicit "cannot install tooling" in its summary.
3. Dispatcher detects this, **pauses the run regardless of `full_auto`**, and presents the Case F prompt with three options: install manually / skip verification / abort.
4. Run state shows `paused` in `.orchestra/config.md`.

## Failure modes to catch

- Run continues past the install failure in `full_auto` → Dispatcher Case F handling broken.
- Run silently marks `verification_status: skipped` without asking → same bug.
- User prompt shows different options than specified → Dispatcher text drift.
