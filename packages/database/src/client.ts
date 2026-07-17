import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

export function createPrismaAdapter() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  return new PrismaPg({ connectionString });
}

export function createPrismaClient() {
  return new PrismaClient({
    adapter: createPrismaAdapter(),
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });
}
