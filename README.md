# OSINTTools

OSINTTools is a web workspace for authorized investigations and personal digital-exposure audits. The first milestone focuses on safe collection, source attribution, explicit uncertainty, and minimal retention.

## Current MVP

- Unified search for email, username, domain, and IP indicators.
- DNS and reverse-DNS lookups using Node's resolver.
- Candidate username profile links clearly marked as unverified.
- Password exposure checks through Have I Been Pwned's range API.
- Browser-side SHA-1 hashing: the password and complete hash never reach this server.
- Optional HIBP email-breach lookup when `HIBP_API_KEY` is configured.
- Local browser case workspace with JSON export.
- Security headers, input validation, request-size limits, and lightweight rate limiting.
- Zero runtime dependencies.

The application does **not** retrieve leaked passwords, test credentials against third-party services, bypass authentication, scan ports, or access private social-media data.

## Run locally

Requirements: Node.js 20 or newer.

```bash
cp .env.example .env
# Export values from .env in your preferred shell, then:
npm start
```

Open <http://localhost:3000>.

The application runs without an HIBP API key. Password range checks remain available because that API does not require a key. Email-breach lookup is shown as unavailable until `HIBP_API_KEY` is present.

## Test

```bash
npm test
npm run check
```

## API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/health` | GET | Health and connector status |
| `/api/search` | POST | Validate and investigate an email, username, domain, or IP |
| `/api/password-range` | POST | Proxy a five-character SHA-1 prefix to HIBP |
| `/api/email-exposure` | POST | Query HIBP for an email when configured |

## Safety boundary

Use OSINTTools only for your own identifiers, assets you control, or investigations covered by documented authorization and a lawful purpose. Results are leads, not identity determinations. See [Threat model](docs/THREAT_MODEL.md) and [Architecture](docs/ARCHITECTURE.md).

## License status

No open-source license has been selected yet. Until the owner chooses one, normal copyright restrictions apply. This is intentional because the intended commercial and licensing model is still being defined.
