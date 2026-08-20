# Contexual

Contexual is a team AI workspace in an npm/Turborepo monorepo:

- `apps/web` — Next.js web client (port 3000)
- `apps/api` — NestJS API (port 3001)
- `apps/admin` — Next.js platform admin console (port 3002)
- `packages/database` — Prisma schema, migrations, and PostgreSQL client
- `packages/ui` — design tokens and shared UI primitives
- `file-worker` — separate asynchronous malware-scan and extraction process

## Implemented behavior

- OpenAI, Anthropic, Google Gemini, and xAI chat streams provider events to the
  browser as they arrive. The server-side `MODEL_CATALOG` is authoritative for
  provider/model pairing, pricing estimates, context limits, and defaults.
- Members can view their own usage and limits; administrators can view
  organization/member usage and manage limits. Account settings support profile
  updates and password changes. A password change revokes every session and
  returns the user to login.
- Suspended memberships cannot use workspace features or be selected as the
  active organization. A suspended user can switch to another active workspace
  or create one.
- The file library accepts content-sniffed TXT, Markdown, CSV, JSON, PDF, and
  DOCX files. Uploads reserve plan storage/count quota and enter quarantine.
  The worker scans with ClamAV, fails closed when scanning is unavailable,
  extracts text (including PDF/DOCX), promotes clean objects, and records
  `PENDING_SCAN`, `SCANNING`, `EXTRACTING`, `READY`, `QUARANTINED`, or `FAILED`.
  Only `READY` files can be downloaded or attached to chat.
- `/api/health` and `/api/health/live` are liveness endpoints.
  `/api/health/ready` verifies PostgreSQL, ClamAV, and storage.
- Transactional email is persisted in a PostgreSQL outbox and delivered by the
  worker process's retrying outbox processor.
- Platform staff sign in to `apps/admin` with credentials that have no
  relationship to customer accounts, and hold a session that is separate from
  customer sessions: a distinct cookie, a signing key derived from `JWT_SECRET`,
  and a SELECT-only row-level security policy for cross-tenant reads. Roles are
  `SUPPORT`, `OPERATOR`, and `OWNER`.

## Platform administration

`PlatformAdmin` is a standalone table with its own email, password, and TOTP
secret. It has no foreign key to `User`, so no customer-facing flow — password
reset in particular — can reach a staff credential, and staff never appear in
tenant-facing tables.

Seed the first `OWNER` once, on a fresh installation:

```bash
PLATFORM_SEED_EMAIL=owner@example.com npm run platform:seed --workspace @repo/api
```

The command is idempotent and does nothing once any admin exists. It prints a
generated temporary password unless `PLATFORM_SEED_PASSWORD` is set, which is
required in production.

Every subsequent admin is created per-person, because `PlatformAuditLog` and
`ImpersonationGrant` attribute actions to an individual and a shared login would
make that attribution worthless:

```bash
npm run platform:grant --workspace @repo/api -- someone@example.com --name "Ayesha" --role OPERATOR
npm run platform:grant --workspace @repo/api -- someone@example.com --reset-password
npm run platform:grant --workspace @repo/api -- someone@example.com --revoke
```

Both commands are CLI-only, so platform access cannot be escalated to over the
network and recovering a locked-out admin requires database access rather than
an emailed link. Seeded and reset accounts must choose a new password before any
console route works, and enroll a TOTP authenticator on first sign-in; the
secret is stored encrypted with `ENCRYPTION_KEY`.

Password verification is isolated behind `PlatformCredentialsService`, which is
the only code that knows how an admin proves identity. Adding an external
identity provider later means adding a method there that resolves the same row;
the reserved `ssoSubject` column exists so that does not require a migration.

`OPERATOR` and above can impersonate a customer for support. Every session
requires a written reason, is time-boxed to at most 60 minutes, is recorded in
both `PlatformAuditLog` and the customer's own audit feed, shows a persistent
banner in the customer app, and refuses destructive actions such as changing
credentials, provider keys, billing, or membership.

## Local development

Requirements: Node.js 20.16+, npm 10+, and PostgreSQL. ClamAV is also required
to complete file processing with the secure default.

1. Run `npm install`.
2. Copy each example to its untracked counterpart:
   - `apps/api/.env.example` → `apps/api/.env`
   - `apps/web/.env.example` → `apps/web/.env`
   - `apps/admin/.env.example` → `apps/admin/.env`
   - `packages/database/.env.example` → `packages/database/.env`
3. Keep `JWT_SECRET` identical in API and web configuration, and keep
   `DATABASE_URL` aligned between API and database configuration.
4. Run:

   ```bash
   npm run db:generate
   npm run db:migrate
   npm run dev
   ```

5. In another terminal, start the file and email-outbox worker:

   ```bash
   npm run worker:dev --workspace @repo/api
   ```

Open `http://localhost:3000`.

`npm run dev` is intentionally bare development: it starts the API, web app,
and database TypeScript watcher, but not PostgreSQL, ClamAV, or the worker.
Without ClamAV the API can serve normal requests, but readiness fails and file
jobs cannot become `READY`. For a local-only insecure bypass, explicitly set
`FILE_SCANNING_REQUIRED=false`; production rejects this setting.

## Docker Compose

After creating `apps/api/.env` and `apps/web/.env`, run:

```bash
docker compose up --build
```

Compose starts PostgreSQL and ClamAV, runs committed migrations once, then
starts the API, dedicated file worker, and web app. PostgreSQL and ClamAV data
use named volumes. The example Compose topology is for local integration: its
database credentials and local container storage are not production defaults.

## Configuration and external services

The example files contain safe placeholders only. In production the API
validates the following at startup:

- PostgreSQL `DATABASE_URL`
- a strong non-default `JWT_SECRET` (also supplied to the web app)
- a non-default 64-hex-character `ENCRYPTION_KEY`
- public HTTPS `WEB_URL`
- `RESEND_API_KEY` and `EMAIL_FROM`
- durable `S3_BUCKET` and `S3_REGION` (plus endpoint/credentials when needed)
- `FILE_SCANNING_REQUIRED=true` and a non-loopback `CLAMAV_HOST`

Stripe remains optional; paid billing requires the secret key, webhook secret,
and recurring Price IDs. AI credentials are organization-owned and connected
from the Providers page. Production file storage requires S3/R2-compatible
credentials or workload identity. Resend requires a verified sender.

Keep secrets in a deployment secret manager, never in Git or image layers.
Rotate JWT secrets with a planned global re-login. Rotating `ENCRYPTION_KEY`
requires re-encrypting stored provider credentials (or reconnecting providers);
do not replace it without a migration. Rotate compromised provider, Stripe,
Resend, database, and object-storage credentials at their issuers and update the
secret manager.

Production database access must use a dedicated non-superuser application role.
RLS-protected tenant operations set transaction-local `app.organization_id`;
PostgreSQL superusers and roles with `BYPASSRLS` defeat that boundary. Apply
migrations with a separate privileged migration identity, then grant the app
role only the required schema/table/sequence permissions.

## Verification commands

```bash
npm run db:generate
npm run db:validate
npm run db:status
npm run lint
npm test --workspace @repo/api -- --runInBand
npm test --workspace @repo/web
npm run test:e2e --workspace @repo/api -- --runInBand
npm run build
npm run test:e2e --workspace @repo/web -- --list
docker compose config --quiet
git diff --check
```

API e2e requires migrated PostgreSQL and is intended to run as a non-superuser
application role. Browser execution additionally requires built/running API,
worker, and web services; `--list` only discovers Playwright tests.

GitHub Actions currently runs:

- lint, API/web unit tests, and all builds;
- migration deployment/status and API e2e against PostgreSQL as a non-superuser
  app role, with ClamAV;
- Compose validation and API/web Docker build smoke tests;
- Playwright smoke only when repository variable `RUN_PLAYWRIGHT` is `true`.

See `HANDOFF.md` for architecture, deployment boundaries, and remaining setup.
