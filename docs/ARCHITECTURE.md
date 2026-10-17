# Architecture

## Design principles

1. Passive collection before active interaction.
2. Every finding has a provider, observation time, and verification state.
3. Passwords and complete hashes remain in the browser.
4. High-risk connectors are disabled until authorization and retention controls exist.
5. A connector failure must not invalidate findings from other sources.

## Current flow

```text
Browser UI
  ├─ indicator search ──> Node API ──> validation ──> connector
  ├─ password ──> local SHA-1 ──> five-character prefix ──> HIBP range API
  └─ case workspace ──> browser localStorage ──> user-controlled JSON export
```

## Planned boundaries

- `connectors`: one adapter per provider with explicit timeout and normalized output.
- `cases`: PostgreSQL-backed evidence records after authentication is added.
- `workers`: isolated asynchronous jobs for Maigret and document processing.
- `graph`: entity and relationship projections; every edge points to evidence.
- `policy`: purpose, authorization, retention, and country restrictions.

## Next technical increment

1. Authentication, MFA, and role-based access.
2. PostgreSQL persistence with encrypted sensitive columns.
3. Case authorization record and retention deadline.
4. Maigret worker with per-site rate limits and false-positive scoring.
5. Shodan connector limited to passive lookups.
6. OpenSanctions connector with entity-match explanations.
7. Evidence snapshots and SHA-256 integrity hashes.
