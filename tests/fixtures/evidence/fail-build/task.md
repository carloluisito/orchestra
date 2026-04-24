---
id: T-FAIL-BUILD
title: Add TypeScript user validator
status: pending
token_budget: 80000
evidence: true
verification_status: pending
---

## Objective
Add a user-validation TypeScript module at src/validators/user.ts that exports validateUser(input: UserInput): ValidationResult. The test for it passes but the file has a type error that only the build step catches.

## Acceptance Criteria
- Module file exists at src/validators/user.ts.
- Unit test in src/validators/user.test.ts passes.
- Project compiles successfully (`npm run build` exits 0).
