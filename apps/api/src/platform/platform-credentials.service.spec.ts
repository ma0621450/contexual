import type { PlatformAdmin } from '@contexual/database';
import { hashPassword } from '../auth/auth.utils';
import type { PrismaService } from '../database/prisma.service';
import { PlatformCredentialsService } from './platform-credentials.service';

const PASSWORD = 'a-correct-horse-battery-staple';

function build(admin: PlatformAdmin | null) {
  const findFirst = jest.fn().mockResolvedValue(admin);
  const update = jest.fn().mockImplementation(({ data }: { data: object }) => ({
    ...admin,
    ...data,
  }));

  const prisma = {
    platformAdmin: { findFirst, update },
  } as unknown as PrismaService;

  return {
    findFirst,
    update,
    service: new PlatformCredentialsService(prisma),
  };
}

async function adminFixture(
  overrides: Partial<PlatformAdmin> = {},
): Promise<PlatformAdmin> {
  return {
    id: 'admin-1',
    email: 'staff@example.com',
    name: 'Staff',
    passwordHash: await hashPassword(PASSWORD),
    role: 'OWNER',
    mustChangePassword: false,
    ssoSubject: null,
    totpSecretCiphertext: null,
    totpSecretIv: null,
    totpConfirmedAt: null,
    lastLoginAt: null,
    disabledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('PlatformCredentialsService', () => {
  it('resolves the admin when the password matches', async () => {
    const admin = await adminFixture();
    const { service } = build(admin);

    await expect(service.verify(admin.email, PASSWORD)).resolves.toBe(admin);
  });

  it('rejects a wrong password without revealing the account', async () => {
    const admin = await adminFixture();
    const { service } = build(admin);

    await expect(service.verify(admin.email, 'not-the-password')).resolves.toBe(
      null,
    );
  });

  it('rejects an unknown account', async () => {
    const { service } = build(null);

    await expect(service.verify('nobody@example.com', PASSWORD)).resolves.toBe(
      null,
    );
  });

  it('excludes disabled accounts at the query level', async () => {
    const { service, findFirst } = build(null);

    await service.verify('  Staff@Example.com  ', PASSWORD);

    expect(findFirst).toHaveBeenCalledWith({
      where: { email: 'staff@example.com', disabledAt: null },
    });
  });

  it('clears the rotation requirement when a password is set', async () => {
    const admin = await adminFixture({ mustChangePassword: true });
    const { service, update } = build(admin);

    await service.setPassword(admin.id, 'a-brand-new-password-value');

    expect(update).toHaveBeenCalledWith({
      where: { id: 'admin-1' },
      data: {
        passwordHash: expect.any(String) as string,
        mustChangePassword: false,
      },
    });
  });
});
