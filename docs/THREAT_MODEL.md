# Threat model

## Intended users

- A person auditing their own digital exposure.
- An analyst investigating assets owned by their organization.
- An investigator operating under documented legal authority or client authorization.

## Protected assets

- Search subjects and identifiers.
- API keys and provider credentials.
- Evidence, notes, and case associations.
- Audit history and authorization records.

## Primary abuse cases

- Stalking or profiling a person without a lawful purpose.
- Enumerating accounts from phone numbers at scale.
- Retrieving or displaying leaked plaintext passwords.
- Credential testing or account takeover.
- Active scanning outside an authorized scope.
- Treating a matching username as proof of identity.
- Retaining personal data indefinitely.

## MVP mitigations

- Person and phone automation are disabled.
- Username results are labelled as candidate URLs, not confirmed accounts.
- No credential testing, port scanning, or authentication bypass.
- Password hashing occurs in the browser; only a five-character hash prefix leaves it.
- The server does not persist cases or search values.
- API request bodies are size-limited and rate-limited.
- Private and reserved IP ranges are not sent for reverse lookup.
- Strict browser security headers and no third-party scripts.

## Controls required before multi-user deployment

- MFA and least-privilege roles.
- Per-case lawful-purpose and authorization record.
- Search audit log with tamper-evident storage.
- Data classification and retention schedules.
- Abuse monitoring, quotas, and account suspension workflow.
- Vendor and cross-border data-transfer assessment.
- ARCO request and deletion workflow.
- Privacy impact assessment for biometrics or automated profiling.
