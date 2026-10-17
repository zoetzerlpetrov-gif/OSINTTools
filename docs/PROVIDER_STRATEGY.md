# Username provider strategy

## Current tier: candidate catalog

OSINTTools includes an internally maintained catalog of public profile URL patterns. A username search constructs candidate URLs locally on the server and returns them with `verification: not-checked`.

This tier does not contact every listed service. It is fast, avoids burst traffic, and prevents HTTP status codes or generic profile pages from being presented as confirmed identities.

## Implemented prototype: verified worker

Version 0.4 adds an optional local Maigret worker outside the web request cycle. It is disabled by default, accepts no more than 50 sites, uses five concurrent connections, disables recursive discovery, and runs through a single in-memory queue.

Before enabling it in a multi-user deployment, the following controls remain required:

1. Require an authenticated case, stated purpose, and authorization record.
2. Select categories and a maximum provider count rather than scanning every source automatically.
3. Enqueue a job with bounded concurrency, provider-specific timeouts, and a global request budget.
4. Respect provider terms, robots guidance where applicable, and explicit block signals.
5. Record response time, verification method, observation timestamp, and evidence hash.
6. Classify results as `confirmed`, `probable`, `ambiguous`, `not-found`, or `blocked`.
7. Never treat matching usernames as proof that two accounts belong to the same person.

## Upstream projects

- Maigret is the current optional worker because its repository is MIT-licensed and maintains a large provider definition set.
- Sherlock is a secondary compatibility source under the MIT license.
- WhatsMyName is useful for validation research, but its dataset uses CC BY-SA 4.0. Bundling or adapting it requires attribution and share-alike review against the intended commercial licensing model.

Third-party provider definitions must retain required notices and remain separable from proprietary case-management, scoring, and reporting code.

## Sources that require separate controls

- Email breach services: return breach metadata, never plaintext passwords.
- Phone-number services: disabled until jurisdiction, consent, minimization, and abuse controls are implemented.
- Facial search: disabled until biometric-data governance and an explicit legal basis are implemented.
- Sanctions and politically exposed person data: require explainable matching and human review.
- Dark-web or leak sources: accept metadata from lawful providers only; do not ingest stolen credential collections.
