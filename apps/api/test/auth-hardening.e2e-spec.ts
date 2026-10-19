import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { hashOtp } from './../src/auth/auth.utils';
import { applyTrustProxy } from './../src/config/trust-proxy';
import { PrismaService } from './../src/database/prisma.service';
import { MailService } from './../src/mail/mail.service';

jest.setTimeout(60_000);

const RATE_LIMITED = {
  statusCode: 429,
  code: 'RATE_LIMITED',
  message: expect.stringMatching(
    /^Too many attempts\. Please wait \d+ minutes? and try again\.$/,
  ) as unknown,
  retryAfterSeconds: expect.any(Number) as unknown,
};

describe('Auth hardening (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ipCounter = 0;

  /** A distinct client address as appended by the trusted edge proxy. */
  function nextClientIp() {
    ipCounter += 1;
    return `198.51.100.${ipCounter}`;
  }

  function expireRateLimits() {
    return prisma.$executeRaw`
      UPDATE "RateLimitBucket"
      SET "resetAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '1 second'
    `;
  }

  async function registerVerified(ip: string, email: string) {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/register')
      .set('X-Forwarded-For', ip)
      .send({ name: 'Hardening User', email, password: 'password123' })
      .expect(201);
    return agent;
  }

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    applyTrustProxy(app, { TRUST_PROXY_HOPS: '1' });
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.$executeRaw`DELETE FROM "RateLimitBucket"`;
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await app.close();
  });

  it('locks login per account identically for real and unknown emails, then recovers', async () => {
    const ip = nextClientIp();
    const email = `login-limit-${Date.now()}@example.com`;
    await registerVerified(ip, email);
    const unknown = `nobody-${Date.now()}@example.com`;

    const failures: Array<{ status: number; body: unknown }> = [];
    for (const target of [email, unknown]) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await request(app.getHttpServer())
          .post('/api/auth/login')
          .set('X-Forwarded-For', ip)
          .send({ email: target, password: 'wrong-password' });
        failures.push({ status: response.status, body: response.body });
      }
    }
    expect(new Set(failures.map((f) => JSON.stringify(f))).size).toBe(1);
    expect(failures[0]?.status).toBe(401);

    const lockedReal = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ email, password: 'password123' })
      .expect(429);
    const lockedUnknown = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ email: unknown, password: 'password123' })
      .expect(429);
    expect(lockedReal.body).toMatchObject(RATE_LIMITED);
    expect(lockedUnknown.body).toMatchObject(RATE_LIMITED);
    expect(Number(lockedReal.headers['retry-after'])).toBeGreaterThan(0);

    await expireRateLimits();
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ email, password: 'password123' })
      .expect(200);
  });

  it('caps OTP guesses per user, ignores the correct code while locked, and recovers', async () => {
    const ip = nextClientIp();
    const email = `otp-limit-${Date.now()}@example.com`;
    const agent = await registerVerified(ip, email);
    await prisma.user.update({
      where: { email },
      data: { emailVerificationOtpHash: hashOtp('1234') },
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await agent
        .post('/api/auth/verify-email')
        .set('X-Forwarded-For', ip)
        .send({ otp: '5678' })
        .expect(401);
    }
    const locked = await agent
      .post('/api/auth/verify-email')
      .set('X-Forwarded-For', ip)
      .send({ otp: '1234' })
      .expect(429);
    expect(locked.body).toMatchObject(RATE_LIMITED);

    await expireRateLimits();
    await agent
      .post('/api/auth/verify-email')
      .set('X-Forwarded-For', ip)
      .send({ otp: '1234' })
      .expect(200);
  });

  it('limits verification resends per user after the cooldown', async () => {
    const ip = nextClientIp();
    const email = `resend-limit-${Date.now()}@example.com`;
    const agent = await registerVerified(ip, email);
    const pastCooldown = () =>
      prisma.user.update({
        where: { email },
        data: { emailVerificationOtpSentAt: new Date(Date.now() - 120_000) },
      });

    await agent
      .post('/api/auth/resend-verification')
      .set('X-Forwarded-For', ip)
      .expect(400);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await pastCooldown();
      await agent
        .post('/api/auth/resend-verification')
        .set('X-Forwarded-For', ip)
        .expect(200);
    }
    await pastCooldown();
    await agent
      .post('/api/auth/resend-verification')
      .set('X-Forwarded-For', ip)
      .expect(429);

    await expireRateLimits();
    await agent
      .post('/api/auth/resend-verification')
      .set('X-Forwarded-For', ip)
      .expect(200);
  });

  it('answers password reset requests identically while silently capping emails per account', async () => {
    const mail = app.get(MailService);
    const sendReset = jest
      .spyOn(mail, 'sendPasswordReset')
      .mockResolvedValue(undefined);
    const email = `reset-limit-${Date.now()}@example.com`;
    await registerVerified(nextClientIp(), email);

    const bodies = new Set<string>();
    for (const target of [email, `ghost-${Date.now()}@example.com`]) {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const response = await request(app.getHttpServer())
          .post('/api/auth/forgot-password')
          .set('X-Forwarded-For', nextClientIp())
          .send({ email: target })
          .expect(200);
        bodies.add(JSON.stringify(response.body));
      }
    }
    expect(bodies.size).toBe(1);
    expect(sendReset).toHaveBeenCalledTimes(3);

    await expireRateLimits();
    await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .set('X-Forwarded-For', nextClientIp())
      .send({ email })
      .expect(200);
    expect(sendReset).toHaveBeenCalledTimes(4);
  });

  it('keys per-IP limits on the proxy-appended address, not client-supplied entries', async () => {
    const realIp = nextClientIp();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .set('X-Forwarded-For', `203.0.113.${attempt}, ${realIp}`)
        .send({ email: `spoof-${attempt}@example.com` })
        .expect(200);
    }
    const blocked = await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .set('X-Forwarded-For', `10.9.8.7, ${realIp}`)
      .send({ email: 'spoof-final@example.com' })
      .expect(429);
    expect(blocked.body).toMatchObject(RATE_LIMITED);

    await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .set('X-Forwarded-For', nextClientIp())
      .send({ email: 'other-client@example.com' })
      .expect(200);
  });

  it('limits reset-token submissions and invite previews per IP', async () => {
    const ip = nextClientIp();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .set('X-Forwarded-For', ip)
        .send({ token: `guess-${attempt}`, password: 'password123' })
        .expect(400);
    }
    await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .set('X-Forwarded-For', ip)
      .send({ token: 'guess-final', password: 'password123' })
      .expect(429);

    const previewIp = nextClientIp();
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await request(app.getHttpServer())
        .get('/api/onboarding/invite-preview')
        .set('X-Forwarded-For', previewIp)
        .query({ token: `guess-${attempt}` })
        .expect(404);
    }
    await request(app.getHttpServer())
      .get('/api/onboarding/invite-preview')
      .set('X-Forwarded-For', previewIp)
      .query({ token: 'guess-final' })
      .expect(429);
  });

  it('keeps the invite proof out of query strings, logs, API responses and stored records', async () => {
    const mail = app.get(MailService);
    const inviteUrls: string[] = [];
    jest.spyOn(mail, 'sendTeamInvite').mockImplementation((params) => {
      inviteUrls.push(params.inviteUrl);
      return Promise.resolve();
    });
    const logged: string[] = [];
    jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation((message: unknown) => {
        logged.push(String(message));
      });

    const stamp = Date.now();
    const admin = await registerVerified(
      nextClientIp(),
      `secret-admin-${stamp}@example.com`,
    );
    await admin
      .post('/api/auth/verify-email')
      .send({ otp: '0000' })
      .expect(200);
    await admin
      .post('/api/onboarding/create-organization')
      .send({ name: 'Secret Org' })
      .expect(200);
    const inviteeEmail = `secret-invitee-${stamp}@example.com`;
    const created = await admin
      .post('/api/organizations/invites')
      .send({ email: inviteeEmail, role: 'MEMBER' })
      .expect(201);

    const url = new URL(inviteUrls[0] ?? '');
    const proof = new URLSearchParams(url.hash.slice(1)).get('proof') ?? '';
    expect(proof.length).toBeGreaterThan(20);
    expect(url.search).not.toContain(proof);

    const listed = await admin.get('/api/organizations/invites').expect(200);
    expect(JSON.stringify(created.body)).not.toContain(proof);
    expect(JSON.stringify(listed.body)).not.toContain(proof);

    const invite = await prisma.invite.findFirstOrThrow({
      where: { email: inviteeEmail },
    });
    expect(JSON.stringify(invite)).not.toContain(proof);
    const audits = await prisma.auditLog.findMany({
      where: { organizationId: invite.organizationId },
    });
    expect(JSON.stringify(audits)).not.toContain(proof);
    const outbox = await prisma.emailOutbox.findMany({
      where: { to: inviteeEmail },
    });
    expect(JSON.stringify(outbox)).not.toContain(proof);
    expect(logged.join('\n')).not.toContain(proof);

    const joined = await request(app.getHttpServer())
      .post('/api/onboarding/invite-signup')
      .set('X-Forwarded-For', nextClientIp())
      .send({
        token: invite.token,
        proof,
        name: 'Secret Invitee',
        password: 'password123',
      })
      .expect(200);
    expect(joined.body).toMatchObject({ joined: true });
  });

  it('rejects all auth traffic with 503 rather than skipping limits when the store is unavailable', async () => {
    jest
      .spyOn(prisma, '$queryRaw')
      .mockRejectedValue(
        new Error('relation "RateLimitBucket" does not exist'),
      );

    const response = await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .set('X-Forwarded-For', nextClientIp())
      .send({ email: 'anyone@example.com' })
      .expect(503);
    expect(JSON.stringify(response.body)).not.toContain('RateLimitBucket');
  });
});
