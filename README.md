# OSINTTools

OSINTTools is a web workspace for authorized investigations and personal digital-exposure audits. The first milestone focuses on safe collection, source attribution, explicit uncertainty, and minimal retention.

## Current MVP

- Unified search for email, username, domain, and IP indicators.
- DNS and reverse-DNS lookups using Node's resolver.
- RDAP registration lookups for domains and public IP addresses.
- Optional Shodan host intelligence using existing observations only; no active scanning.
- Categorized username catalog with 91 public profile patterns, clearly marked as unverified candidates.
- Immediate provider-specific existence checks for 16 compatible public sources, with found, not-found, blocked, inconclusive, and error states.
- Optional remote Maigret worker for bounded asynchronous checks of up to 500 sources per authorized job.
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

## Deploy on Vercel

The repository is ready for a Git-connected Vercel deployment. The `public/` directory contains the static interface and `api/index.mjs` adapts the same API handler to a serverless function.

Keep `ENABLE_USERNAME_VERIFICATION` disabled on Vercel; it is the legacy local prototype. The broad Maigret integration runs in a separate Python worker and the web app communicates with it through signed requests.

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
| `/api/username/verify` | POST | Queue an authorized Maigret verification job when enabled |
| `/api/username/verify-quick` | POST | Check up to 16 compatible username providers immediately |
| `/api/username/verify-broad` | POST | Queue a signed, authorized job in the remote Maigret worker |
| `/api/username/broad-jobs/:id` | GET | Read a broad job's normalized status and results |
| `/api/jobs/:id` | GET | Read the status and normalized result of a verification job |

Domain searches combine DNS with RDAP. Public-IP searches combine reverse DNS and RDAP, and add Shodan when its key is configured. A failed provider is reported independently instead of discarding findings from other providers.

Username searches generate candidate profile URLs across social, development, security, media, creative, professional, gaming, commerce, legacy, and regional services. They do not send 91 automated requests and do not claim that an account exists. The interface can filter the candidates by category.

See [Provider strategy](docs/PROVIDER_STRATEGY.md) for the planned verified-search worker and third-party dataset boundaries.

## Remote Maigret worker

The Docker worker is in `worker/` and `render.yaml` provides a Render Blueprint. Deploy it on a container host, define a random secret of at least 32 characters as `OSINTTOOLS_WORKER_SECRET`, and then set these variables on the Vercel project before redeploying:

```text
MAIGRET_WORKER_URL=https://your-worker.example
MAIGRET_WORKER_SECRET=the-same-random-secret
```

To run the container locally:

```bash
docker build -t osinttools-maigret worker
docker run --rm -p 8080:8080 \
  -e OSINTTOOLS_WORKER_SECRET='replace-with-at-least-32-random-characters' \
  osinttools-maigret
```

The web API signs the exact request body and timestamp with HMAC-SHA256. The worker rejects expired signatures, caps sites, queue depth, concurrency and runtime, disables recursive discovery, stores jobs only in memory, and discards Maigret's raw response bodies.

The UI labels these results `REPORTADO POR MAIGRET`, distinct from `ENCONTRADO` results returned by provider-specific APIs. A report is a lead requiring manual confirmation, not proof of account ownership.

## Legacy local worker

The worker is disabled by default. To enable it locally in PowerShell:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r worker\requirements.txt
$env:MAIGRET_PYTHON="$PWD\.venv\Scripts\python.exe"
$env:ENABLE_USERNAME_VERIFICATION="true"
npm start
```

The legacy local verification form requires a stated purpose, explicit authorization acknowledgement, and a limit of 1 to 50 sites. It remains available for development but is not used by the Vercel deployment.

## Safety boundary

Use OSINTTools only for your own identifiers, assets you control, or investigations covered by documented authorization and a lawful purpose. Results are leads, not identity determinations. See [Threat model](docs/THREAT_MODEL.md) and [Architecture](docs/ARCHITECTURE.md).

## License status

No open-source license has been selected yet. Until the owner chooses one, normal copyright restrictions apply. This is intentional because the intended commercial and licensing model is still being defined.
