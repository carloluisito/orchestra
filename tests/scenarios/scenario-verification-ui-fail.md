# Scenario: UI task verification — fail case (the login-redirect bug)

## Goal

Verify the specific failure mode the Verifier was designed to catch: a work agent runs an E2E test, the test happens to produce a screenshot of a login page (because the test environment wasn't authenticated), and the agent declares success. The Verifier must catch this and force a retry.

## Setup

1. Same as scenario-verification-ui-pass.
2. Additionally: set up the project such that the first attempt's E2E test will produce a screenshot of the login page, not the intended feature. This can be done by having a test fixture that doesn't authenticate before visiting the target page.

## Run

```
/orchestra run "Add a /settings page showing the user's current theme preference."
```

Accept defaults.

## Expected outcome

1. **First attempt:** Work agent dispatches. Produces `.orchestra/evidence/NNN-slug/screenshot.png` showing the login page. Returns summary claiming success.
2. **Verifier:** Returns `fail` with a reason referencing the screenshot showing a login page rather than the settings page.
3. **Retry trigger:** Dispatcher archives the evidence to `.orchestra/evidence/NNN-slug/attempt-1/` and re-dispatches the work agent with a `## Verification Feedback` block.
4. **Second attempt:** Work agent addresses the feedback (sets up authentication in the E2E test, produces a screenshot of the actual settings page). Verifier returns `pass`.
5. **Final state:** task `status: done`, `verification_status: passed`.
6. **History shows both attempts:** two `Verifier:` entries in `.orchestra/history.md`, the first with `verdict=fail`, the second with `verdict=pass`.

## Failure modes to catch

- Verifier accepts the login screenshot as "working" → vision-based verification broken or prompt too lenient.
- Retry doesn't include the verification feedback → Context Curator integration broken.
- Archive directory `attempt-1/` missing → Dispatcher archive step broken.
