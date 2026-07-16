import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MemoryScope, MembershipRole } from '@contexual/database';
import type { AuthUser } from '../auth/auth.types';
import { getActiveMembership } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { getPlanLimits } from '../organizations/plan-limits';

@Injectable()
export class MemoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  list(organizationId: string, userId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.memory.findMany({
        where: {
          organizationId,
          OR: [{ scope: MemoryScope.ORGANIZATION }, { userId }],
        },
        orderBy: [{ scope: 'asc' }, { updatedAt: 'desc' }],
      }),
    );
  }

  getPromptMemories(organizationId: string, userId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.memory.findMany({
        where: {
          organizationId,
          enabled: true,
          OR: [{ scope: MemoryScope.ORGANIZATION }, { userId }],
        },
        select: { title: true, content: true, scope: true },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
    );
  }

  async create(
    organizationId: string,
    user: AuthUser,
    input: { title: string; content: string; scope: MemoryScope },
  ) {
    this.assertScopeAllowed(user, input.scope);

    const memory = await this.prisma.withTenant(organizationId, async (tx) => {
      const [organization, memoryCount] = await Promise.all([
        tx.organization.findUnique({
          where: { id: organizationId },
          select: { planTier: true },
        }),
        tx.memory.count({ where: { organizationId } }),
      ]);
      if (
        !organization ||
        memoryCount >= getPlanLimits(organization.planTier).maxMemories
      ) {
        throw new ForbiddenException(
          'This organization has reached its plan memory limit',
        );
      }
      return tx.memory.create({
        data: {
          organizationId,
          userId: input.scope === MemoryScope.USER ? user.id : null,
          scope: input.scope,
          title: input.title,
          content: input.content,
        },
      });
    });

    await this.auditService.record({
      organizationId,
      actorId: user.id,
      action: 'memory.created',
      details: { memoryId: memory.id, scope: memory.scope },
    });

    return memory;
  }

  async update(
    organizationId: string,
    user: AuthUser,
    memoryId: string,
    input: { title?: string; content?: string; enabled?: boolean },
  ) {
    const memory = await this.getAuthorizedMemory(
      organizationId,
      user,
      memoryId,
    );

    const updated = await this.prisma.withTenant(organizationId, (tx) =>
      tx.memory.update({
        where: { id: memory.id, organizationId },
        data: input,
      }),
    );

    await this.auditService.record({
      organizationId,
      actorId: user.id,
      action: 'memory.updated',
      details: { memoryId, scope: memory.scope },
    });

    return updated;
  }

  async remove(organizationId: string, user: AuthUser, memoryId: string) {
    const memory = await this.getAuthorizedMemory(
      organizationId,
      user,
      memoryId,
    );

    await this.prisma.withTenant(organizationId, (tx) =>
      tx.memory.delete({
        where: { id: memory.id, organizationId },
      }),
    );
    await this.auditService.record({
      organizationId,
      actorId: user.id,
      action: 'memory.deleted',
      details: { memoryId, scope: memory.scope },
    });

    return { ok: true };
  }

  private async getAuthorizedMemory(
    organizationId: string,
    user: AuthUser,
    memoryId: string,
  ) {
    const memory = await this.prisma.withTenant(organizationId, (tx) =>
      tx.memory.findFirst({
        where: { id: memoryId, organizationId },
      }),
    );

    if (!memory) {
      throw new NotFoundException('Memory not found');
    }

    if (memory.scope === MemoryScope.USER && memory.userId !== user.id) {
      throw new NotFoundException('Memory not found');
    }

    this.assertScopeAllowed(user, memory.scope);
    return memory;
  }

  private assertScopeAllowed(user: AuthUser, scope: MemoryScope) {
    if (
      scope === MemoryScope.ORGANIZATION &&
      getActiveMembership(user)?.role !== MembershipRole.ADMIN
    ) {
      throw new ForbiddenException(
        'Only organization admins can manage organization memories',
      );
    }
  }
}
