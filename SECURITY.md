# Security policy

## Reporting a vulnerability

Do not open a public issue containing exploit details, credentials, personal data, or a searchable target. Until a dedicated security address is configured, contact the repository owner privately through GitHub.

Include affected version, reproduction conditions, impact, and a minimal proof of concept that does not access third-party data.

## Secrets

- Never commit API keys or `.env` files.
- Use repository or deployment-platform secret storage.
- Rotate a key immediately if it is exposed in an issue, log, commit, or screenshot.
- Do not place target identifiers in CI logs.
