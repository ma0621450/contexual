import { randomBytes } from 'crypto';
import {
  PlatformRole,
  PrismaClient,
  createPrismaAdapter,
} from '@contexual/database';
import { hashPassword } from '../auth/auth.utils';

/**
 * Creates the first OWNER on a fresh installation.
 *
 * Idempotent: if any platform admin already exists this does nothing, so it is
 * safe to run from a deployment pipeline. Every later account is created
 * per-person with `platform:grant`, because the audit log and impersonation
 * records attribute actions to an individual and a shared login would make
 * that attribution worthless.
 *
 *   npm run platform:seed --workspace @repo/api
 */
async function main() {
  const email = (process.env.PLATFORM_SEED_EMAIL ?? '').trim().toLowerCase();
  const name = (process.env.PLATFORM_SEED_NAME ?? 'Platform Owner').trim();

  if (!email) {
    throw new Error('PLATFORM_SEED_EMAIL is required to seed the first admin');
  }

  const providedPassword = process.env.PLATFORM_SEED_PASSWORD?.trim();
  if (process.env.NODE_ENV === 'production' && !providedPassword) {
    throw new Error(
      'PLATFORM_SEED_PASSWORD must be set explicitly in production',
    );
  }

  // A generated password is never written anywhere but this console, and the
  // account cannot be used until it is rotated on first sign-in.
  const password = providedPassword || randomBytes(18).toString('base64url');

  const prisma = new PrismaClient({ adapter: createPrismaAdapter() });

  try {
    const existing = await prisma.platformAdmin.count();
    if (existing > 0) {
      console.log(
        `Platform admins already exist (${existing}). Nothing to seed.`,
      );
      return;
    }

    const admin = await prisma.platformAdmin.create({
      data: {
        email,
        name,
        passwordHash: await hashPassword(password),
        role: PlatformRole.OWNER,
        mustChangePassword: true,
      },
    });

    console.log(`Seeded OWNER ${admin.email}.`);
    if (!providedPassword) {
      console.log(`Temporary password: ${password}`);
      console.log('This is shown once. It must be changed at first sign-in.');
    } else {
      console.log('Sign in with PLATFORM_SEED_PASSWORD and change it.');
    }
    console.log('Two-factor enrollment is required on first sign-in.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
