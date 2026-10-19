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

## Auth hardening release: migrations and rollout

Two migrations ship with the auth/onboarding work. Both are additive (new
enum types, nullable columns, one new table) and safe while the previous
release is still serving:

- `20261019090000_workspace_profile_invite_proof`: organization profile enums
  and columns, `Invite.emailProofHash`;
- `20261019120000_auth_rate_limits_email_redaction`: `RateLimitBucket` table,
  `EmailOutbox.contentRedactedAt`.

Never assume an environment matches local state. Run
`npx prisma migrate status --config packages/database/prisma.config.ts`
against each target first; it is read-only.

Rollout order:

1. Back up or snapshot the database.
2. `npm run db:deploy` with the migration identity. The `ALTER TABLE`s take a
   brief exclusive lock on `Organization`, `Invite`, and `EmailOutbox`. Run
   outside long-running transactions, or set `lock_timeout` and retry.
3. Grant the runtime role access to the new table:
   `GRANT SELECT, INSERT, UPDATE, DELETE ON "RateLimitBucket" TO <app_role>;`
4. Deploy the worker. It delivers both plaintext rows queued by the old API
   and encrypted rows from the new one. An old worker would send encrypted
   bodies verbatim, so the worker must precede the API.
5. Deploy the web app. It reads the invite proof from the URL fragment and
   still accepts the legacy `?proof=` query, so it works with either API.
6. Deploy the API with `TRUST_PROXY_HOPS` set (production refuses to start
   without it).

If the schema is not yet available, `/api/health/ready` returns 503 with
`schema: "unavailable"`, which keeps Compose and orchestrators from routing to
the API. The check also fails when the runtime role lacks privileges on the
new columns. If traffic arrives anyway, rate-limited endpoints fail closed
with 503 instead of skipping limits:

- login, register, email verification and resend;
- forgot/reset password;
- invite preview, invite signup, and join;
- platform login.

Existing sessions and other endpoints keep working.

Rollback and forward recovery:

- Application rollback needs no schema change; old code ignores the new
  columns and table. Roll back the API first, then wait until no encrypted
  mail is queued before rolling back the worker:
  `SELECT count(*) FROM "EmailOutbox" WHERE status IN ('PENDING','RETRY','PROCESSING') AND html LIKE 'enc:v1:%';`
- Avoid schema rollback. If unavoidable, `DROP TABLE "RateLimitBucket"` loses
  only transient counters. Dropping `Invite.emailProofHash` makes outstanding
  emailed proofs invalid, but invitees fall back to the email code.
- If a migration fails part-way, fix forward: inspect the partial state, mark
  it with `prisma migrate resolve --rolled-back <name>` once reverted, or
  `--applied` once completed manually, then redeploy.
- Lockouts can be lifted with `DELETE FROM "RateLimitBucket"`. Keys are
  `<rule>:<sha256(lower(trim(subject)))>`, so a single key can be targeted.

Rate limits are fixed windows in PostgreSQL shared by all API instances (see
`apps/api/src/rate-limit/rate-limit.policies.ts`). Responses are 429 with a
`Retry-After` header and a generic message. Login and reset requests behave
identically for unknown and existing emails. Per-IP limits trust only the
`X-Forwarded-For` entry appended by the edge proxies counted in
`TRUST_PROXY_HOPS`. The API port must therefore be reachable only from the web
app; the Compose file publishes 3001 for local use only.

Email bodies carry OTPs, reset links, and invite links. They are encrypted
with `ENCRYPTION_KEY` while queued, and replaced with a placeholder once the
row is SENT or permanently FAILED. The worker also redacts older finished rows
hourly. Delivery metadata (recipient, subject, status, attempts, sanitized
error, provider ID, timestamps) is kept for troubleshooting with no expiry
yet. Database backups taken before this release still contain plaintext
bodies.

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
stored provider keys must first be re-encrypted or providers reconnected, and
emails still queued under the old key are marked FAILED.
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
