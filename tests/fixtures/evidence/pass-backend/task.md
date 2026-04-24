---
id: T-PASS-BE
title: Add POST /api/users endpoint
status: pending
token_budget: 80000
evidence: true
verification_status: pending
---

## Objective
Add a POST /api/users endpoint that creates a new user from { name, email, password } and returns 201 with the created user (password stripped). Rejects duplicate emails with 409. Rejects malformed bodies with 400.

## Acceptance Criteria
- POST with valid body returns 201 and the created user (no password field).
- POST with a duplicate email returns 409.
- POST with a malformed body returns 400.
