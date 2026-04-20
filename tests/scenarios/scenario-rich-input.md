# Scenario: Rich Input Decomposition

## Input

- **Spec:** `tests/fixtures/sample-spec.md` (Task Management API specification)
- **Plan:** `tests/fixtures/sample-plan.md` (4-phase implementation plan with 16 numbered steps)
- **Expected Classification:** Rich (both spec and numbered plan exist)

## Expected Behavior

The decomposer should follow Procedure A (Rich Input Decomposition) and produce a task DAG with approximately 10-12 tasks across 4-5 waves.

---

## Expected Task Breakdown

The 16 plan steps should be consolidated through the grouping rules (A2). Steps operating on the same file or closely related concerns within the same phase may merge. The expected groupings:

### Phase 1: Foundation (Steps 1-4)

| Expected Task | Source Steps | Rationale |
|---------------|-------------|-----------|
| T001 — Init project with TypeScript | Step 1 | Standalone project setup |
| T002 — Prisma schema and migration | Steps 2, 3, 4 | Steps 2-4 all operate on Prisma config/schema and are sequential small steps within the same concern |

### Phase 2: Auth (Steps 5-9)

| Expected Task | Source Steps | Rationale |
|---------------|-------------|-----------|
| T003 — Password hashing utility | Step 5 | Single utility file |
| T004 — JWT utility | Step 6 | Single utility file |
| T005 — Register endpoint | Step 7 | Distinct endpoint |
| T006 — Login endpoint | Step 8 | Distinct endpoint |
| T007 — Auth middleware | Step 9 | Separate middleware concern |

Note: Steps 5 and 6 are small utility tasks but operate on different files, so they should not be merged. Steps 7 and 8 operate on the same file (`src/routes/auth.ts`) but are each substantial enough that merging is acceptable though not required. Either 4 or 5 tasks from this phase is valid.

### Phase 3: Task CRUD (Steps 10-13)

| Expected Task | Source Steps | Rationale |
|---------------|-------------|-----------|
| T008 — GET /tasks endpoint | Step 10 | First route, creates the file |
| T009 — POST /tasks endpoint | Step 11 | Adds to the route file |
| T010 — PATCH and DELETE /tasks | Steps 12, 13 | Both are small update/delete handlers on the same file; merging is acceptable |

Note: Alternatively, all four CRUD steps could yield 4 separate tasks, or steps 10-11 could merge (both create the initial tasks route). The decomposer has flexibility here. Expect 2-4 tasks from this phase.

### Phase 4: Polish (Steps 14-16)

| Expected Task | Source Steps | Rationale |
|---------------|-------------|-----------|
| T011 — Input validation with Zod | Step 14 | Cross-cutting concern |
| T012 — RFC 7807 error handler | Step 15 | Separate middleware |
| T013 — Integration tests | Step 16 | Distinct testing task |

Note: Steps 14 and 15 are both middleware but address different concerns (validation vs error formatting), so they should remain separate.

**Total expected range: 10-13 tasks.**

---

## Expected Dependencies

The dependency graph should include at minimum these edges:

```
T001 (init project)
 ├── T002 (prisma schema) depends on T001
 │    ├── T005 (register) depends on T002, T003
 │    ├── T006 (login) depends on T002, T004
 │    └── T008 (GET /tasks) depends on T002, T007
 ├── T003 (password util) depends on T001
 ├── T004 (JWT util) depends on T001
 └── T007 (auth middleware) depends on T004

T009 (POST /tasks) depends on T008
T010 (PATCH/DELETE /tasks) depends on T008 or T009

T011 (validation) depends on T005, T006, T008 (or end of Phase 3)
T012 (error handler) depends on T001 (or Phase 3 tasks)
T013 (integration tests) depends on T011, T012 (or all Phase 3 tasks)
```

The exact edges may vary — what matters is that the dependency direction is correct and there are no cycles.

---

## Expected Waves

With the dependency structure above, the waves should approximate:

| Wave | Tasks | Rationale |
|------|-------|-----------|
| Wave 1 | T001 | No dependencies — project init |
| Wave 2 | T002, T003, T004 | All depend only on T001 |
| Wave 3 | T005, T006, T007 | Depend on Wave 2 tasks |
| Wave 4 | T008, T009, T010 (or subset) | Depend on auth middleware and schema |
| Wave 5 | T011, T012, T013 (or subset) | Polish and testing |

Expect 4-5 waves. Fewer than 4 waves suggests the decomposer is not inferring enough dependencies. More than 6 waves suggests over-serialization.

---

## Expected Token Budgets

Given a default `token_budget` of 80000:

| Task | Expected Budget | Rationale |
|------|----------------|-----------|
| T001 — Init project | 40000 (50%) | Simple: project scaffold, config files |
| T002 — Prisma schema and migration | 40000 (50%) | Simple: schema definition and migration command |
| T003 — Password hashing | 40000 (50%) | Simple: single utility with two functions |
| T004 — JWT utility | 40000 (50%) | Simple: single utility with two functions |
| T005 — Register endpoint | 80000 (100%) | Standard: route handler with validation and DB |
| T006 — Login endpoint | 80000 (100%) | Standard: route handler with credential verification |
| T007 — Auth middleware | 80000 (100%) | Standard: middleware with token parsing and error handling |
| T008-T010 — Task CRUD | 80000 (100%) each | Standard: route handlers with DB operations |
| T011 — Validation | 80000 (100%) | Standard: schema definitions and middleware wiring |
| T012 — Error handler | 80000 (100%) | Standard: middleware with RFC 7807 formatting |
| T013 — Integration tests | 120000 (150%) | Complex: many test cases covering multiple flows |

---

## Expected Context Pointers

Each task should have accurate `spec_sections`. Spot-check these:

| Task | Expected spec_sections |
|------|----------------------|
| T002 — Prisma schema | ["Data Model"] |
| T005 — Register endpoint | ["Auth", "API Endpoints", "Requirements"] |
| T006 — Login endpoint | ["Auth", "API Endpoints", "Requirements"] |
| T007 — Auth middleware | ["Auth", "Requirements"] |
| T008 — GET /tasks | ["Tasks", "API Endpoints"] |
| T012 — Error handler | ["Requirements"] |

---

## Validation Checklist

Run through this checklist to validate the decomposer output:

### Structure
- [ ] All task files exist in `.orchestra/tasks/` with the naming pattern `NNN-slug.md`
- [ ] Task IDs are sequential and zero-padded (T001, T002, ...)
- [ ] Slug is kebab-case and at most 30 characters
- [ ] `dag.md` has been updated with all tasks
- [ ] `config.md` status is `in_progress`
- [ ] `history.md` has a decomposition entry

### Task Count
- [ ] Total tasks are between 10 and 13 (inclusive)
- [ ] No plan step is unaccounted for (every numbered step maps to at least one task)

### Dependencies
- [ ] No circular dependencies exist
- [ ] All Phase 2+ tasks depend on at least one earlier task
- [ ] Utility tasks (password, JWT) are depended on by the endpoints that use them
- [ ] Auth middleware is a dependency of all task CRUD endpoints

### Waves
- [ ] Between 4 and 6 waves (inclusive)
- [ ] Wave 1 contains only T001 (or T001 + another independent init task)
- [ ] The last wave contains integration tests
- [ ] No wave is empty

### Quality
- [ ] Every task has 2-5 acceptance criteria
- [ ] Every task has a single-sentence objective
- [ ] Every task has at least one entry in `spec_sections`
- [ ] Every task has at least one entry in `relevant_files`
- [ ] Token budgets are assigned (no task has budget of 0 or null)
- [ ] Simple utility tasks have lower budgets than complex tasks
- [ ] Integration test task has the highest budget

### Content Accuracy
- [ ] Register endpoint task references email uniqueness check (from spec)
- [ ] Login endpoint task references 401 response on invalid credentials (from spec)
- [ ] Task CRUD endpoints reference 404 responses for missing resources (from spec)
- [ ] Error handler task references RFC 7807 fields: type, title, status, detail (from spec)
- [ ] Validation task references Zod or equivalent (from plan)
