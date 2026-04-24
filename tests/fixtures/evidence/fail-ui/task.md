---
id: T-FAIL-UI
title: Add user profile edit form (failing evidence)
status: pending
token_budget: 80000
evidence: true
verification_status: pending
---

## Objective
Add a user profile edit page at /profile/edit that allows the user to update their display name and email. Form submission updates the user record and redirects to /profile with a success message.

## Acceptance Criteria
- Page renders at /profile/edit with a form containing Name and Email inputs.
- Submitting the form with valid values updates the user and shows a success state.
- Invalid email shows an inline validation error without submitting.
