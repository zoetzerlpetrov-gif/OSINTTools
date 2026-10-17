# OSINTTools

OSINTTools is a web workspace for authorized investigations and personal digital-exposure audits. The first milestone focuses on safe collection, source attribution, explicit uncertainty, and minimal retention.

## Current MVP

- Unified search for email, username, domain, and IP indicators.
- DNS and reverse-DNS lookups using Node's resolver.
- RDAP registration lookups for domains and public IP addresses.
- Optional Shodan host intelligence using existing observations only; no active scanning.
- Categorized username catalog with 89 public profile patterns, clearly marked as unverified candidates.
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

The application runs without API keys. Password range checks and RDAP remain available. Email-breach lookup requires `HIBP_API_KEY`; passive Shodan host intelligence requires `SHODAN_API_KEY`.

RDAP contact cards and raw Shodan banners are deliberately excluded from normalized results. This reduces collection of personal data and avoids retaining unnecessary service content.

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

Domain searches combine DNS with RDAP. Public-IP searches combine reverse DNS and RDAP, and add Shodan when its key is configured. A failed provider is reported independently instead of discarding findings from other providers.

Username searches generate candidate profile URLs across social, development, security, media, creative, professional, gaming, commerce, legacy, and regional services. They do not send 89 automated requests and do not claim that an account exists. The interface can filter the candidates by category.

See [Provider strategy](docs/PROVIDER_STRATEGY.md) for the planned verified-search worker and third-party dataset boundaries.

## Safety boundary

Use OSINTTools only for your own identifiers, assets you control, or investigations covered by documented authorization and a lawful purpose. Results are leads, not identity determinations. See [Threat model](docs/THREAT_MODEL.md) and [Architecture](docs/ARCHITECTURE.md).

## License status

No open-source license has been selected yet. Until the owner chooses one, normal copyright restrictions apply. This is intentional because the intended commercial and licensing model is still being defined.
