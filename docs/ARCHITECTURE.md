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
  ├─ domain ──> Node API ──> DNS + RDAP
  ├─ public IP ──> Node API ──> reverse DNS + RDAP + optional Shodan
  ├─ password ──> local SHA-1 ──> five-character prefix ──> HIBP range API
  └─ case workspace ──> browser localStorage ──> user-controlled JSON export
```

## Planned boundaries

- `connectors`: one adapter per provider with explicit timeout and normalized output.
- `cases`: PostgreSQL-backed evidence records after authentication is added.
- `workers`: isolated asynchronous jobs for Maigret and document processing.
- `graph`: entity and relationship projections; every edge points to evidence.
- `policy`: purpose, authorization, retention, and country restrictions.

## Passive infrastructure boundary

- RDAP queries use the resource-specific bootstrap endpoint and retain normalized registration metadata only.
- RDAP entity contact cards are omitted to minimize personal-data collection.
- Shodan host lookup uses `minify=true` and only for a validated public IP.
- Private, local, multicast, and reserved IP addresses are never sent to RDAP or Shodan.
- Raw service banners are not returned to the browser or stored in case exports.
- OSINTTools never connects to target ports and does not request historical Shodan banners.
- Provider failures remain isolated through `Promise.allSettled`.

## Next technical increment

1. Authentication, MFA, and role-based access.
2. PostgreSQL persistence with encrypted sensitive columns.
3. Case authorization record and retention deadline.
4. Maigret worker with per-site rate limits and false-positive scoring.
5. OpenSanctions connector with entity-match explanations.
6. Evidence snapshots and SHA-256 integrity hashes.
