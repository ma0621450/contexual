# Engineering handoff

## Implemented product areas

- Cookie authentication with access refresh and logout
- Multi-organization membership, switching, invite acceptance, leaving, and
  admin transfer
- OpenAI, Anthropic, Google Gemini, and xAI chat with provider-specific model
  selection, pricing, context truncation, streaming errors, conversation
  archive, memories, and text-file attachments
- Monthly member and organization spend/token limits with in-app threshold
  alerts
- Stripe billing integration and Resend email integration
- S3-compatible or local development file storage

## Database changes

Run `npm run db:deploy` outside development or `npm run db:migrate` during
local schema development. Recent migrations add memories, monthly usage
limits, stored-file metadata, message attachments, atomic usage reservations,
and PostgreSQL row-level security for memories and files. RLS access must use
`PrismaService.withTenant`; it sets transaction-local `app.organization_id`.
Production must use a non-superuser database login because PostgreSQL
superusers bypass RLS even when `FORCE ROW LEVEL SECURITY` is enabled.

## External configuration still required

The repository cannot provide or test account-owned credentials:

- Stripe: `STRIPE_SECRET_KEY`, webhook secret, and recurring Price IDs
- Resend: `RESEND_API_KEY` and a verified `EMAIL_FROM`
- AI providers: connect a real OpenAI, Anthropic, Gemini, or xAI key from the
  Providers page
- Production file storage: S3/R2 endpoint, bucket, and credentials

Use test-mode Stripe keys first. Forward local events with:

```bash
stripe listen --forward-to localhost:3001/api/billing/webhook
```

## Upload security policy

The current allowlist is text-only (TXT, Markdown, CSV, JSON), rejects NUL
bytes, enforces plan-based size limits, and scopes every database query by
organization. Before allowing richer formats, add a malware-scanning service,
content-sniffing, quarantine status, and asynchronous extraction.

## Verification

- `npm run lint`
- `npm run test`
- `npm run test:e2e --workspace=@repo/api` (requires PostgreSQL)
- `npm run build`

GitHub Actions runs these checks with PostgreSQL. `docker compose up --build`
starts PostgreSQL, applies migrations, and runs the API and web app locally.
