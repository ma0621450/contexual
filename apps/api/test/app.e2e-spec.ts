import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/database/prisma.service';

type OrganizationResponse = { id: string };
type FileResponse = { id: string; filename: string };

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
      .expect(201);
    const fileBody = file.body as FileResponse;
    expect(fileBody.filename).toBe('notes.txt');
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
      WHERE relname IN ('Memory', 'StoredFile', 'MessageAttachment')
    `;
    expect(rlsTables).toHaveLength(3);
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

    await agent
      .post('/api/onboarding/switch-organization')
      .send({ organizationId: organizationBody[0]?.id })
      .expect(200);

    await agent.get('/api/chat/conversations').expect(200);
    const chat = await agent
      .post('/api/chat/messages/stream')
      .send({
        content: 'Use the attachment',
        model: 'gpt-4o-mini',
        attachmentIds: [fileBody.id],
      })
      .expect(201);
    expect(chat.text).toContain('No AI provider is connected');
  });

  afterEach(async () => {
    await app.close();
  });
});
