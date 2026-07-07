import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@contexual/database';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(params: {
    organizationId: string;
    actorId: string | null;
    action: string;
    details?: Prisma.InputJsonValue;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          organizationId: params.organizationId,
          actorId: params.actorId,
          action: params.action,
          details: params.details,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to write audit log for action "${params.action}"`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  async list(organizationId: string, limit = 50) {
    return this.prisma.auditLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { actor: { select: { name: true, email: true } } },
    });
  }
}
