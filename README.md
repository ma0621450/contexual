# Contexual

Contexual is a team AI workspace built as an npm/Turborepo monorepo:

- `apps/web` — Next.js web client (port 3000)
- `apps/api` — NestJS API (port 3001)
- `packages/database` — Prisma schema and PostgreSQL client

## Requirements

- Node.js 20 or newer
- npm 10 or newer
- PostgreSQL

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `apps/api/.env.example` to `apps/api/.env`,
   `apps/web/.env.example` to `apps/web/.env`, and
   `packages/database/.env.example` to `packages/database/.env`.

3. Set `JWT_SECRET` to the same strong value in both files. The web proxy
   verifies access tokens created by the API, so different values will cause
   authenticated users to be redirected to login.

4. Set `DATABASE_URL` and apply the database migrations:

   ```bash
   npm run db:generate
   npm run db:migrate
   ```

   The API and database package use separate environment files. Keep
   `DATABASE_URL` aligned in both.

5. Start both applications:

   ```bash
   npm run dev
   ```

Open `http://localhost:3000`.

## Required environment variables

### API (`apps/api/.env`)

- `DATABASE_URL` — PostgreSQL connection string.
- `JWT_SECRET` — access-token signing secret; must exactly match the web value.
- `ACCESS_TOKEN_EXPIRY` — access-token and cookie lifetime, such as `15m`,
  `1h`, or `1d`.
- `REFRESH_TOKEN_EXPIRY_DAYS` — refresh-token lifetime in days.
- `PORT` — API port; defaults to `3001`.
- `WEB_URL` — public web origin used for links and redirects.
- `ENCRYPTION_KEY` — 32-byte (64-character hexadecimal) AES key used to
  encrypt provider API keys. Generate one with:

  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

### Web (`apps/web/.env`)

- `JWT_SECRET` — must exactly match the API value.
- `ACCESS_TOKEN_EXPIRY` — should match the API setting.
- `INTERNAL_API_URL` — server-side API origin, normally
  `http://localhost:3001`.

`NEXT_PUBLIC_API_URL` is optional. Leave it unset when using the built-in
same-origin `/api` rewrite.

## Optional integrations

Stripe billing is enabled when `STRIPE_SECRET_KEY` is present. Configure
`STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, and
`STRIPE_PRICE_BUSINESS` for paid plans.

Email delivery through Resend is enabled when `RESEND_API_KEY` and
`EMAIL_FROM` are set. Without them, development emails and verification codes
are logged by the API.

File uploads use S3-compatible object storage when `S3_BUCKET` is set. Configure
`S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY` for
AWS S3, Cloudflare R2, or MinIO. Without a bucket, development uploads are
written beneath `LOCAL_UPLOAD_DIR`; do not use local storage in a
multi-instance production deployment.

The initial upload policy accepts TXT, Markdown, CSV, and JSON files. Size
limits depend on the plan (1–10 MB). Binary content is rejected and files are
always scoped to the active organization. Add malware scanning before
expanding the production allowlist to executable, archive, Office, or PDF
formats.

Never commit real environment files or production secrets. The repository
ignores `.env` files; use your deployment platform's secret manager in
production.

## Commands

- `npm run dev` — run all applications in development mode.
- `npm run build` — build all workspaces.
- `npm run lint` — lint all workspaces.
- `npm run test` — run tests.
- `npm run db:generate` — regenerate the Prisma client.
- `npm run db:migrate` — create/apply a development migration.
- `npm run db:deploy` — apply committed migrations in CI/production.

See `HANDOFF.md` for deployment, external-service, and upload-security notes.
