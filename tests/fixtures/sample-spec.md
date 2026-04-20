# Task Management API — Specification

## Overview

A RESTful API for managing tasks and users. Users can register, log in, and perform CRUD operations on tasks. Tasks are assigned to users and track status through a simple workflow: todo, in_progress, done. The API uses JSON over HTTP, authenticates via JWT, and persists data in PostgreSQL.

---

## Data Model

### User

| Field        | Type      | Constraints              |
|--------------|-----------|--------------------------|
| id           | UUID      | Primary Key              |
| email        | string    | Unique, Required         |
| name         | string    | Required                 |
| passwordHash | string    | Required                 |
| createdAt    | timestamp | Auto-generated on create |

### Task

| Field       | Type      | Constraints                          |
|-------------|-----------|--------------------------------------|
| id          | UUID      | Primary Key                          |
| title       | string    | Required                             |
| description | string    | Optional                             |
| status      | enum      | One of: `todo`, `in_progress`, `done`|
| assigneeId  | UUID      | Foreign Key -> User                  |
| createdAt   | timestamp | Auto-generated on create             |
| updatedAt   | timestamp | Auto-generated on create and update  |

---

## API Endpoints

### Auth

| Method | Path             | Description                          | Auth Required |
|--------|------------------|--------------------------------------|---------------|
| POST   | /auth/register   | Create a new user account            | No            |
| POST   | /auth/login      | Authenticate and receive a JWT token | No            |

**POST /auth/register**
- Request body: `{ email, name, password }`
- Validates email format and password minimum length (8 characters).
- Hashes the password before storing.
- Returns 201 with `{ id, email, name, createdAt }`.
- Returns 409 if email already exists.

**POST /auth/login**
- Request body: `{ email, password }`
- Verifies the email exists and the password matches.
- Returns 200 with `{ token }` — a signed JWT containing `{ sub: userId, email }`.
- Returns 401 if credentials are invalid.

### Tasks

All task endpoints require a valid JWT in the `Authorization: Bearer <token>` header.

| Method | Path         | Description                    | Auth Required |
|--------|--------------|--------------------------------|---------------|
| GET    | /tasks       | List all tasks                 | Yes           |
| POST   | /tasks       | Create a new task              | Yes           |
| PATCH  | /tasks/:id   | Update an existing task        | Yes           |
| DELETE | /tasks/:id   | Delete a task                  | Yes           |

**GET /tasks**
- Returns 200 with an array of all tasks.
- Supports optional query parameters: `status` (filter by status), `assigneeId` (filter by assignee).

**POST /tasks**
- Request body: `{ title, description?, status?, assigneeId? }`
- Defaults: `status` = `todo`, `assigneeId` = the authenticated user's ID.
- Returns 201 with the created task object.

**PATCH /tasks/:id**
- Request body: any subset of `{ title, description, status, assigneeId }`.
- Returns 200 with the updated task object.
- Returns 404 if the task does not exist.

**DELETE /tasks/:id**
- Returns 204 with no body.
- Returns 404 if the task does not exist.

---

## Requirements

1. **Authentication:** All task endpoints must be protected with JWT authentication. Tokens expire after 24 hours.
2. **Input Validation:** All request bodies must be validated. Invalid input returns 400 with details about the validation error.
3. **Error Format:** All error responses must follow RFC 7807 (Problem Details for HTTP APIs), including `type`, `title`, `status`, and `detail` fields.
4. **Database:** PostgreSQL, accessed via Prisma ORM. Migrations must be committed and reproducible.
5. **Runtime:** Node.js with TypeScript. Strict mode enabled.
