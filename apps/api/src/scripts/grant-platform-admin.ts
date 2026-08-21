import { randomBytes } from 'crypto';
import {
  PlatformRole,
  PrismaClient,
  createPrismaAdapter,
} from '@contexual/database';
import { hashPassword } from '../auth/auth.utils';

/**
 * Creates, updates, and revokes individual platform staff accounts.
 *
 * Deliberately a CLI rather than an API surface: platform access cannot be
 * escalated to over the network, and recovering a locked-out admin requires
 * database access rather than an emailed reset link.
 *
 *   npm run platform:grant --workspace @repo/api -- someone@example.com --name "Ayesha" --role OPERATOR
 *   npm run platform:grant --workspace @repo/api -- someone@example.com --reset-password
 *   npm run platform:grant --workspace @repo/api -- someone@example.com --revoke
 */
async function main() {
  const args = process.argv.slice(2);
  const email = args
    .find((arg) => !arg.startsWith('--'))
    ?.trim()
    .toLowerCase();
  const revoke = args.includes('--revoke');
  const resetTotp = args.includes('--reset-totp');
  const resetPassword = args.includes('--reset-password');

  const valueOf = (flag: string) => {
    const index = args.indexOf(flag);
    return index === -1 ? undefined : args[index + 1];
  };

  const rawRole = valueOf('--role') ?? 'SUPPORT';
  const role = rawRole.toUpperCase();
  const name = valueOf('--name');

  if (!email) {
    throw new Error(
      'Usage: platform:grant <email> [--name "Full Name"] [--role SUPPORT|OPERATOR|OWNER] [--reset-password] [--reset-totp] [--revoke]',
    );
  }

  if (!revoke && !(role in PlatformRole)) {
    throw new Error(
      `Invalid role "${rawRole}". Expected one of ${Object.keys(PlatformRole).join(', ')}.`,
    );
  }

  const prisma = new PrismaClient({ adapter: createPrismaAdapter() });

  try {
    const existing = await prisma.platformAdmin.findUnique({
      where: { email },
      select: { id: true, role: true },
    });

    if (revoke) {
      if (!existing) {
        console.log(`${email} does not have platform access.`);
        return;
      }
      await prisma.platformAdmin.delete({ where: { id: existing.id } });
      console.log(`Revoked platform access for ${email}.`);
      return;
    }

    if (!existing) {
      const password = randomBytes(18).toString('base64url');
      const admin = await prisma.platformAdmin.create({
        data: {
          email,
          name: name ?? email,
          passwordHash: await hashPassword(password),
          role: role as PlatformRole,
          mustChangePassword: true,
        },
      });

      console.log(`Created ${admin.role} platform account for ${admin.email}.`);
      console.log(`Temporary password: ${password}`);
      console.log('This is shown once. It must be changed at first sign-in.');
      console.log('Two-factor enrollment is required on first sign-in.');
      return;
    }

    const password = resetPassword
      ? randomBytes(18).toString('base64url')
      : null;

    const admin = await prisma.platformAdmin.update({
      where: { id: existing.id },
      data: {
        role: role as PlatformRole,
        disabledAt: null,
        ...(name ? { name } : {}),
        ...(password
          ? {
              passwordHash: await hashPassword(password),
              mustChangePassword: true,
            }
          : {}),
        ...(resetTotp
          ? {
              totpSecretCiphertext: null,
              totpSecretIv: null,
              totpConfirmedAt: null,
            }
          : {}),
      },
    });

    console.log(`Updated ${admin.email} to ${admin.role}.`);
    if (password) {
      console.log(`Temporary password: ${password}`);
      console.log('This is shown once. It must be changed at next sign-in.');
    }
    if (resetTotp) {
      console.log('Two-factor enrollment will be required at next sign-in.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
