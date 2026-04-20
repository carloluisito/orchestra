# Task Management API — Implementation Plan

## Phase 1: Foundation

1. Initialize the Node.js project with TypeScript. Set up `tsconfig.json` with strict mode, `package.json` with scripts for build/dev/start, and install core dependencies (express, typescript, ts-node, @types/express).
2. Set up Prisma ORM. Install prisma and @prisma/client, run `prisma init`, configure the PostgreSQL datasource in `prisma/schema.prisma`.
3. Define the Prisma schema. Create the `User` and `Task` models with all fields, relations, and enums as specified in the data model section.
4. Run the initial migration. Execute `prisma migrate dev --name init` to generate and apply the migration. Verify the tables exist.

## Phase 2: Auth

5. Implement password hashing utility. Create `src/utils/password.ts` with `hashPassword(plain)` and `verifyPassword(plain, hash)` functions using bcrypt.
6. Implement JWT utility. Create `src/utils/jwt.ts` with `signToken(payload)` and `verifyToken(token)` functions. Token expiry: 24 hours. Secret from environment variable `JWT_SECRET`.
7. Implement the register endpoint. Create `src/routes/auth.ts` with `POST /auth/register` handler. Validate input, hash password, create user via Prisma, return 201 with user data (excluding passwordHash).
8. Implement the login endpoint. Add `POST /auth/login` handler to `src/routes/auth.ts`. Verify credentials, return signed JWT on success, 401 on failure.
9. Implement the auth middleware. Create `src/middleware/auth.ts` that extracts the Bearer token, verifies it, and attaches `req.user = { id, email }` to the request. Return 401 for missing or invalid tokens.

## Phase 3: Task CRUD

10. Implement GET /tasks. Create `src/routes/tasks.ts` with the list endpoint. Support `status` and `assigneeId` query filters. Return the array of tasks.
11. Implement POST /tasks. Add the create handler. Default `status` to `todo`, default `assigneeId` to the authenticated user. Return 201 with the created task.
12. Implement PATCH /tasks/:id. Add the update handler. Accept partial body, look up task by ID, return 404 if not found, apply changes, return updated task.
13. Implement DELETE /tasks/:id. Add the delete handler. Look up task by ID, return 404 if not found, delete and return 204.

## Phase 4: Polish

14. Add input validation middleware. Install a validation library (zod). Create schemas for register, login, create-task, and update-task request bodies. Wire validation into each route.
15. Implement RFC 7807 error handling. Create `src/middleware/errorHandler.ts` as an Express error handler that catches all errors and formats them as Problem Details JSON (`type`, `title`, `status`, `detail`).
16. Write integration tests. Install vitest and supertest. Write tests covering: registration, login, CRUD operations, authentication failures, validation errors, and 404 cases.
