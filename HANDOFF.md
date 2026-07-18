# Engineering handoff

## Completed system

- Cookie authentication supports access refresh, logout, verification, password
  reset, editable profile, and password change. Password changes increment the
  session version, revoke refresh tokens, clear cookies, and require login.
- Multi-organization membership supports switching, invites, leaving/admin
  transfer, member and organization usage limits, member self-usage, and
  suspension. Suspended memberships are rejected server-side and isolated in
  the dashboard instead of receiving normal workspace access.
- Chat supports OpenAI, Anthropic, Google Gemini, and xAI. All four paths use
  true upstream streaming rather than buffering a completed response. The
  server `MODEL_CATALOG` is the authoritative allowlist and metadata source.
  Usage reservation/finalization, context truncation, memories, archive, and
  `READY` file attachments remain integrated.
- The organization file library supports TXT, Markdown, CSV, JSON, PDF, and
  DOCX based on content sniffing rather than the browser MIME claim. Uploads are
  quota-reserved and stored under quarantine. A dedicated worker claims jobs
  with stale-lock recovery, rescans stored bytes, uses ClamAV fail-closed,
  extracts bounded text, promotes clean objects, retries transient failures,
  and quarantines infected content. Downloads and chat attachment lookup require
  `READY`; deletion releases storage/count quota.
- Liveness is dependency-free. Readiness checks PostgreSQL, ClamAV, and object
  storage and returns unavailable when any dependency fails.
- Transactional mail uses a durable PostgreSQL outbox with idempotency keys,
  locking, retry/backoff, stale-lock recovery, and Resend delivery. The
  outbox and file processors run together in the separate worker command.
- Compose topology is PostgreSQL + ClamAV + one-shot migration + API +
  file-worker + web. The Dockerfile provides separate `api`, `worker`, and
  `web` targets.

## Database and isolation

Recent migration files cover file lifecycle/jobs, secure reconciliation of
legacy files, and email outbox state. Use `npm run db:migrate` only for local
schema development; use `npm run db:deploy` for committed migrations in
integration/production.

Tenant RLS operations must go through `PrismaService.withTenant`, which sets
transaction-local `app.organization_id`. File-worker migrations/policies use a
separate transaction-local worker context where required. The runtime
`DATABASE_URL` must belong to a dedicated non-superuser, non-`BYPASSRLS`
application role. Use a separate privileged identity to deploy migrations and
grant only required schema, table, and sequence access to the app role.

## Operations and required setup

Production startup rejects missing or unsafe database, JWT, provider-key
encryption, HTTPS web-origin, Resend, durable S3, and ClamAV configuration. See
`apps/api/.env.example` for the complete safe template.

External account-owned setup is still required:

- AI providers: real OpenAI, Anthropic, Gemini, and/or xAI credentials,
  connected per organization;
- Stripe: secret key, webhook secret, and recurring Price IDs if billing is
  enabled;
- Resend: API key and verified sender;
- S3/R2-compatible storage: bucket, region, endpoint/credentials or workload
  identity;
- network-reachable ClamAV with current signature updates;
- managed PostgreSQL roles, grants, backups, monitoring, and migration access.

Use test-mode Stripe first. For local webhook forwarding:

```bash
stripe listen --forward-to localhost:3001/api/billing/webhook
```

Store all credentials in a secret manager and define rotation owners/runbooks.
JWT rotation logs everyone out. `ENCRYPTION_KEY` cannot be blindly replaced:
stored provider keys must first be re-encrypted or providers reconnected.
Compromised third-party credentials must be rotated with the provider and then
updated in deployment secrets.

## Local and Compose behavior

Bare `npm run dev` does not provision PostgreSQL or ClamAV and does not start
the file/email worker. Run the worker separately:

```bash
npm run worker:dev --workspace @repo/api
```

The secure default requires ClamAV. A bare environment without it can serve
non-file API traffic, but readiness fails and file processing retries/fails.
`FILE_SCANNING_REQUIRED=false` is an explicit local-only bypass and is rejected
in production.

After copying the API and web example env files, `docker compose up --build`
provisions the complete local integration topology and runs `db:deploy` before
application startup. Its built-in PostgreSQL credentials and container-local
storage assumptions are development examples, not a production deployment.

## CI and verification

`.github/workflows/ci.yml` is the source of truth:

- `quality`: install, Prisma generate, lint, API/web unit tests, build;
- `integration`: PostgreSQL + ClamAV, non-superuser app role, migration
  deploy/status, API e2e;
- `docker`: Compose config plus API/web image build smoke;
- `browser-smoke`: full Playwright smoke only when `RUN_PLAYWRIGHT=true`.

Useful local commands are listed in `README.md`. API e2e needs a migrated
PostgreSQL database with suitable role grants. Playwright `--list` verifies test
discovery only; a successful browser run additionally requires live built
services and browser dependencies.

No documentation or static verification can validate real provider responses,
mail deliverability, Stripe webhooks, object-storage IAM, ClamAV signature
freshness, managed database privileges/backups, or production network policy.
Treat production readiness as pending those environment-specific checks.
