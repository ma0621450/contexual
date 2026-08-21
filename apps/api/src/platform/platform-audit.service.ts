import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@contexual/database';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class PlatformAuditService {
  private readonly logger = new Logger(PlatformAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(params: {
    platformAdminId: string | null;
    action: string;
    targetType?: string;
    targetId?: string;
    details?: Prisma.InputJsonValue;
    ipAddress?: string | null;
  }): Promise<void> {
    try {
      await this.prisma.platformAuditLog.create({
        data: {
          platformAdminId: params.platformAdminId,
          action: params.action,
          targetType: params.targetType,
          targetId: params.targetId,
          details: params.details,
          ipAddress: params.ipAddress ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to write platform audit log for action "${params.action}"`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  list(limit = 100) {
    return this.prisma.platformAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        platformAdmin: { select: { name: true, email: true } },
      },
    });
  }
}
