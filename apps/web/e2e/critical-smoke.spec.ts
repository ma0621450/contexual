import { expect, test, type BrowserContext } from '@playwright/test';

const apiBase = process.env.PLAYWRIGHT_API_URL ?? 'http://127.0.0.1:3001/api';

async function registerVerified(
  context: BrowserContext,
  email: string,
  name = 'Playwright User',
) {
  const register = await context.request.post(`${apiBase}/auth/register`, {
    data: { name, email, password: 'password123' },
  });
  expect(register.ok()).toBeTruthy();
  const verify = await context.request.post(`${apiBase}/auth/verify-email`, {
    data: { otp: '0000' },
  });
  expect(verify.ok()).toBeTruthy();
}

async function createOrganization(context: BrowserContext, name: string) {
  const response = await context.request.post(
    `${apiBase}/onboarding/create-organization`,
    { data: { name } },
  );
  expect(response.ok()).toBeTruthy();
}

test('login returns an existing user to the dashboard', async ({
  page,
  context,
}) => {
  const email = `pw-login-${Date.now()}@example.com`;
  await registerVerified(context, email);
  await createOrganization(context, 'Playwright Login Workspace');
  await context.request.post(`${apiBase}/auth/logout`);

  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole('heading', { name: 'Hello, Playwright' }),
  ).toBeVisible();
});

test('onboarding creates a workspace and file lifecycle is visible', async ({
  page,
  context,
}) => {
  const email = `pw-files-${Date.now()}@example.com`;
  await registerVerified(context, email);

  await page.goto('/onboarding');
  await page.getByRole('button', { name: /Create an organization/ }).click();
  await page.getByLabel('Organization name').fill('Playwright Files Workspace');
  await page.getByRole('button', { name: 'Create organization' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto('/dashboard/files');
  await page.getByLabel('Choose a file to upload').setInputFiles({
    name: 'smoke.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('deterministic Playwright upload'),
  });
  const row = page.getByRole('row').filter({ hasText: 'smoke.txt' });
  await expect(row).toBeVisible();
  await expect(row).toContainText(/Waiting for scan|Scanning|Processing|Ready/);
});

test('member navigation excludes admin audit access', async ({
  browser,
  context,
}) => {
  const stamp = Date.now();
  const adminEmail = `pw-admin-${stamp}@example.com`;
  const memberEmail = `pw-member-${stamp}@example.com`;
  await registerVerified(context, adminEmail, 'Playwright Admin');
  await createOrganization(context, 'Playwright Member Workspace');
  const inviteResponse = await context.request.post(
    `${apiBase}/organizations/invites`,
    { data: { email: memberEmail, role: 'MEMBER' } },
  );
  expect(inviteResponse.ok()).toBeTruthy();
  const invite = (await inviteResponse.json()) as { token: string };

  const memberContext = await browser.newContext();
  try {
    await registerVerified(memberContext, memberEmail, 'Playwright Member');
    const joined = await memberContext.request.post(
      `${apiBase}/onboarding/join-organization`,
      { data: { token: invite.token } },
    );
    expect(joined.ok()).toBeTruthy();
    const memberPage = await memberContext.newPage();
    await memberPage.goto(
      process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000',
    );
    await expect(memberPage.getByRole('link', { name: 'Billing' })).toBeVisible();
    await expect(
      memberPage.getByRole('link', { name: 'Audit Logs' }),
    ).toHaveCount(0);
  } finally {
    await memberContext.close();
  }
});
