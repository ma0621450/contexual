import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { createPrismaAdapter, Prisma, PrismaClient } from '@contexual/database';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({ adapter: createPrismaAdapter() });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  withTenant<T>(
    organizationId: string,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config('app.organization_id', ${organizationId}, true)
      `;
      return operation(tx);
    });
  }
}
