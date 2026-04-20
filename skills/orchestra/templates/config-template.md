---
project: "{{PROJECT_NAME}}"
created: "{{TIMESTAMP}}"
status: pending
---

## Defaults
token_budget: {{TOKEN_BUDGET|80000}}
autonomy: {{AUTONOMY|checkpoint}}
max_retries: {{MAX_RETRIES|2}}
max_parallel: {{MAX_PARALLEL|3}}
fallback_mode: {{FALLBACK_MODE|auto}}

## Agent Instructions
agent_model: {{AGENT_MODEL|sonnet}}
agent_type: {{AGENT_TYPE|general-purpose}}
use_worktrees: {{USE_WORKTREES|true}}

## Branch
branch_name: {{BRANCH_NAME}}
branch_base: {{BRANCH_BASE|main}}

## Repositories
primary_repo: {{PRIMARY_REPO}}
{{REGISTERED_REPOS}}

## Conventions
conventions_collected: {{CONVENTIONS_COLLECTED|false}}
