import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/database/prisma.service';
import { MailService } from './../src/mail/mail.service';

type OrganizationResponse = { id: string };
type FileResponse = {
  id: string;
  filename: string;
  processingStatus: string;
};
type InviteResponse = { token: string };

jest.setTimeout(30_000);

describe('App (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    await app.get(PrismaService).$executeRaw`DELETE FROM "RateLimitBucket"`;
  });

  it('/api/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('completes auth, multi-org, limits, memories, and file flows', async () => {
    const agent = request.agent(app.getHttpServer());
    const email = `e2e-${Date.now()}@example.com`;

    await agent
      .post('/api/auth/register')
      .send({ name: 'E2E User', email, password: 'password123' })
      .expect(201);
    await agent.post('/api/auth/resend-verification').expect(400);
    await agent
      .post('/api/auth/verify-email')
      .send({ otp: '0000' })
      .expect(200);

    await agent
      .post('/api/onboarding/create-organization')
      .send({ name: 'First E2E Organization' })
      .expect(200);

    const organizations = await agent
      .get('/api/onboarding/organizations')
      .expect(200);
    const organizationBody = organizations.body as OrganizationResponse[];
    expect(organizationBody).toHaveLength(1);

    await agent
      .post('/api/memories')
      .send({
        title: 'Preferred tone',
        content: 'Keep answers concise.',
        scope: 'USER',
      })
      .expect(201);

    const file = await agent
      .post('/api/files/text')
      .send({ filename: 'notes.txt', content: 'Tenant-scoped file content' })
      .expect(202);
    const fileBody = file.body as FileResponse;
    expect(fileBody.filename).toBe('notes.txt');
    expect(fileBody.processingStatus).toBe('PENDING_SCAN');
    const prisma = app.get(PrismaService);
    const rlsTables = await prisma.$queryRaw<
      {
        relname: string;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }[]
    >`
      SELECT relname, relrowsecurity, relforcerowsecurity
      FROM pg_class
      WHERE relname IN (
        'Memory',
        'StoredFile',
        'MessageAttachment',
        'FileProcessingJob'
      )
    `;
    expect(rlsTables).toHaveLength(4);
    expect(
      rlsTables.every(
        (table) => table.relrowsecurity && table.relforcerowsecurity,
      ),
    ).toBe(true);

    await agent
      .patch('/api/organizations/usage-limits')
      .send({ monthlySpendLimitCents: 1000, monthlyTokenLimit: 100000 })
      .expect(200);

    await agent
      .post('/api/onboarding/create-organization')
      .send({ name: 'Second E2E Organization' })
      .expect(200);
    const updatedOrganizations = await agent
      .get('/api/onboarding/organizations')
      .expect(200);
    expect(updatedOrganizations.body as OrganizationResponse[]).toHaveLength(2);
    await agent.get('/api/files').expect(200, []);
    await agent.get('/api/memories').expect(200, []);
    await agent.get(`/api/files/${fileBody.id}/download`).expect(404);

    await agent
      .post('/api/onboarding/switch-organization')
      .send({ organizationId: organizationBody[0]?.id })
      .expect(200);

    const models = await agent
      .get('/api/organizations/providers/models')
      .expect(200);
    expect(Array.isArray(models.body)).toBe(true);
    expect(models.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: 'OPENAI', isDefault: true }),
      ]),
    );

    const memberEmail = `member-${Date.now()}@example.com`;
    const invite = await agent
      .post('/api/organizations/invites')
      .send({ email: memberEmail, role: 'MEMBER' })
      .expect(201);
    const memberAgent = request.agent(app.getHttpServer());
    await memberAgent
      .post('/api/auth/register')
      .send({
        name: 'E2E Member',
        email: memberEmail,
        password: 'password123',
      })
      .expect(201);
    await memberAgent
      .post('/api/auth/verify-email')
      .send({ otp: '0000' })
      .expect(200);
    await memberAgent
      .post('/api/onboarding/join-organization')
      .send({ token: (invite.body as InviteResponse).token })
      .expect(200);
    await memberAgent.get('/api/organizations/usage/me').expect(200);
    await memberAgent.get('/api/organizations/usage').expect(403);
    await memberAgent
      .patch('/api/organizations/usage-limits')
      .send({ monthlySpendLimitCents: 1, monthlyTokenLimit: 1 })
      .expect(403);
    await memberAgent.get('/api/organizations/providers/models').expect(200);
    await memberAgent
      .post('/api/organizations/providers')
      .send({
        provider: 'OPENAI',
        apiKey: 'test-key-never-sent',
        defaultModel: 'gpt-5.6-luna',
      })
      .expect(403);

    await agent.get('/api/chat/conversations').expect(200);
    const chat = await agent
      .post('/api/chat/messages/stream')
      .send({
        content: 'Use the attachment',
        model: 'gpt-5.6-luna',
        attachmentIds: [fileBody.id],
      })
      .expect(201);
    expect(chat.text).toContain('No AI provider is connected');

    await agent
      .patch('/api/auth/profile')
      .send({ name: 'Updated E2E User' })
      .expect(200);
    await agent
      .post('/api/auth/change-password')
      .send({
        currentPassword: 'wrong-password',
        newPassword: 'replacement123',
      })
      .expect(401);
    await agent
      .post('/api/auth/change-password')
      .send({
        currentPassword: 'password123',
        newPassword: 'replacement123',
      })
      .expect(200);
    await agent.get('/api/auth/me').expect(401);
  });

  it('creates workspaces with a custom URL and profile fields', async () => {
    const agent = request.agent(app.getHttpServer());
    const stamp = Date.now();
    await agent
      .post('/api/auth/register')
      .send({
        name: 'Slug User',
        email: `slug-${stamp}@example.com`,
        password: 'password123',
      })
      .expect(201);
    await agent
      .post('/api/auth/verify-email')
      .send({ otp: '0000' })
      .expect(200);

    const slug = `studio-${stamp}`;
    await agent
      .get('/api/onboarding/slug-availability')
      .query({ slug })
      .expect(200, { slug, available: true });
    const reserved = await agent
      .get('/api/onboarding/slug-availability')
      .query({ slug: 'dashboard' })
      .expect(200);
    expect(reserved.body).toMatchObject({
      available: false,
      reason: 'reserved',
    });
    const suggestion = await agent
      .get('/api/onboarding/slug-suggestion')
      .query({ name: 'Studio Workspace' })
      .expect(200);
    expect((suggestion.body as { slug: string }).slug).toMatch(
      /^studio-workspace/,
    );

    await agent
      .post('/api/onboarding/create-organization')
      .send({ name: 'Studio', slug: 'Bad Slug!' })
      .expect(400);
    await agent
      .post('/api/onboarding/create-organization')
      .send({ name: 'Studio', slug, organizationType: 'NOT_A_TYPE' })
      .expect(400);
    await agent
      .post('/api/onboarding/create-organization')
      .send({
        name: 'Studio',
        slug,
        organizationType: 'CREATIVE_STUDIO',
        teamSize: 'SIZE_2_10',
      })
      .expect(200);

    const prisma = app.get(PrismaService);
    const organization = await prisma.organization.findUnique({
      where: { slug },
    });
    expect(organization).toMatchObject({
      organizationType: 'CREATIVE_STUDIO',
      teamSize: 'SIZE_2_10',
    });

    await agent
      .get('/api/onboarding/slug-availability')
      .query({ slug })
      .expect(200, {
        slug,
        available: false,
        reason: 'taken',
        message: 'This workspace URL is already taken',
      });
    await agent
      .post('/api/onboarding/create-organization')
      .send({ name: 'Studio Again', slug })
      .expect(409);
    await request(app.getHttpServer())
      .get('/api/onboarding/slug-availability')
      .query({ slug })
      .expect(401);
  });

  it('signs up invitees with the emailed proof and falls back to an email code without it', async () => {
    const mail = app.get(MailService);
    const inviteUrls: string[] = [];
    jest.spyOn(mail, 'sendTeamInvite').mockImplementation((params) => {
      inviteUrls.push(params.inviteUrl);
      return Promise.resolve();
    });

    const admin = request.agent(app.getHttpServer());
    const stamp = Date.now();
    await admin
      .post('/api/auth/register')
      .send({
        name: 'Invite Admin',
        email: `invite-admin-${stamp}@example.com`,
        password: 'password123',
      })
      .expect(201);
    await admin
      .post('/api/auth/verify-email')
      .send({ otp: '0000' })
      .expect(200);
    await admin
      .post('/api/onboarding/create-organization')
      .send({ name: 'Invite Org' })
      .expect(200);

    const provenEmail = `proven-${stamp}@example.com`;
    const provenInvite = await admin
      .post('/api/organizations/invites')
      .send({ email: provenEmail, role: 'MEMBER' })
      .expect(201);
    const provenBody = provenInvite.body as Record<string, unknown>;
    expect(provenBody).not.toHaveProperty('proof');
    expect(provenBody).not.toHaveProperty('emailProofHash');
    const emailed = new URL(inviteUrls[0] ?? '');
    const proof = new URLSearchParams(emailed.hash.slice(1)).get('proof');
    expect(emailed.searchParams.get('invite')).toBe(provenBody.token);
    expect(emailed.searchParams.has('proof')).toBe(false);
    expect(proof).toBeTruthy();

    const invitee = request.agent(app.getHttpServer());
    const preview = await invitee
      .get('/api/onboarding/invite-preview')
      .query({ token: provenBody.token as string })
      .expect(200);
    expect(preview.body).toMatchObject({
      email: provenEmail,
      hasAccount: false,
    });

    const joined = await invitee
      .post('/api/onboarding/invite-signup')
      .send({
        token: provenBody.token,
        proof,
        name: 'Proven Invitee',
        password: 'password123',
        email: 'someone-else@example.com',
      })
      .expect(200);
    expect(joined.body).toMatchObject({
      joined: true,
      redirectTo: '/dashboard',
    });
    const me = await invitee.get('/api/auth/me').expect(200);
    expect(me.body).toMatchObject({ email: provenEmail });
    expect(
      (me.body as { emailVerifiedAt: string | null }).emailVerifiedAt,
    ).toBeTruthy();
    await invitee.get('/api/organizations/usage/me').expect(200);

    await request(app.getHttpServer())
      .post('/api/onboarding/invite-signup')
      .send({
        token: provenBody.token,
        proof,
        name: 'Replay',
        password: 'password123',
      })
      .expect(409);

    const prisma = app.get(PrismaService);
    const auditEntry = await prisma.auditLog.findFirst({
      where: {
        action: 'invite.accepted',
        details: { path: ['email'], equals: provenEmail },
      },
    });
    expect(auditEntry).not.toBeNull();

    const revoked = await admin
      .post('/api/organizations/invites')
      .send({ email: `revoked-${stamp}@example.com`, role: 'MEMBER' })
      .expect(201);
    const revokedBody = revoked.body as { id: string; token: string };
    await admin
      .delete(`/api/organizations/invites/${revokedBody.id}`)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/onboarding/invite-signup')
      .send({
        token: revokedBody.token,
        name: 'Revoked',
        password: 'password123',
      })
      .expect(409);
    await request(app.getHttpServer())
      .post('/api/onboarding/invite-signup')
      .send({
        token: 'not-a-real-token',
        name: 'Nope',
        password: 'password123',
      })
      .expect(404);

    const copiedEmail = `copied-${stamp}@example.com`;
    const copiedInvite = await admin
      .post('/api/organizations/invites')
      .send({ email: copiedEmail, role: 'MEMBER' })
      .expect(201);
    const copiedToken = (copiedInvite.body as InviteResponse).token;

    const linkHolder = request.agent(app.getHttpServer());
    const fallback = await linkHolder
      .post('/api/onboarding/invite-signup')
      .send({
        token: copiedToken,
        proof: 'guessed-proof',
        name: 'Copied Link',
        password: 'password123',
      })
      .expect(200);
    expect(fallback.body).toMatchObject({ joined: false });
    expect((fallback.body as { redirectTo: string }).redirectTo).toContain(
      '/verify-email',
    );
    const unverified = await linkHolder.get('/api/auth/me').expect(200);
    expect(unverified.body).toMatchObject({
      email: copiedEmail,
      emailVerifiedAt: null,
      memberships: [],
    });
    const pending = await prisma.invite.findFirst({
      where: { token: copiedToken },
    });
    expect(pending?.status).toBe('PENDING');

    await linkHolder
      .post('/api/auth/verify-email')
      .send({ otp: '0000' })
      .expect(200);
    await linkHolder
      .post('/api/onboarding/join-organization')
      .send({ token: copiedToken })
      .expect(200);
  });

  afterEach(async () => {
    await app.close();
  });
});
