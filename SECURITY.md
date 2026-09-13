# Security baseline

The application enforces tenant and role authorization in PostgreSQL Row Level Security (RLS). Browser controls are not treated as an authorization boundary.

## Implemented controls

- Supabase access tokens are verified on every protected API request.
- An active company membership is required before any protected route executes.
- Every business row is tenant-scoped through RLS and compound company foreign keys.
- Job operations and finance operations have separate least-privilege role policies.
- Draft invoices and invoice lines are only written by controlled database functions.
- Issued invoices and allocated charges are immutable.
- Invoice numbers are allocated atomically and invoice creation locks selected charges.
- Charge changes and invoice lifecycle actions are recorded in the audit log.
- API request bodies are size-limited, rate-limited, CORS-restricted and protected with security headers.
- API responses containing business data are marked `no-store`.
- API documentation is disabled in production unless `API_DOCS_ENABLED=true` is explicitly configured.
- User-facing database errors are sanitized so schema and constraint details are not disclosed.
- Temporary passwords require at least 12 characters.

## Production checklist

- Use HTTPS only and terminate TLS at a trusted reverse proxy or managed platform.
- Store `SUPABASE_SECRET_KEY` only in the API runtime secret store. Never expose it through `NEXT_PUBLIC_*`, browser bundles, logs, or screenshots.
- Set one exact `WEB_ORIGIN`; do not use a wildcard origin.
- Keep `API_DOCS_ENABLED` unset or `false` in production.
- Require MFA for owners, administrators and finance users in Supabase Auth.
- Enable leaked-password protection and an appropriate password policy in Supabase Auth.
- Configure automated database backups, point-in-time recovery, restore drills and retention required by the business.
- Export audit and authentication events to monitored, access-controlled log storage with alerts for repeated failures and role changes.
- Rotate API secrets and review user memberships periodically, including immediate deactivation during offboarding.
- Run dependency scanning, database migration tests and authorization regression tests in CI before deployment.
- Complete an independent penetration test before handling production customer and financial data.

## Environment controls

- `API_RATE_LIMIT_MAX` — requests allowed per client IP per minute (default `120`).
- `API_BODY_LIMIT_BYTES` — maximum request body size (default `262144`, or 256 KiB).
- `API_DOCS_ENABLED` — explicitly set to `true` only when production documentation exposure is intended.
