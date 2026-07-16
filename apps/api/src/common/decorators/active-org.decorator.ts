import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import type { AuthUser } from '../../auth/auth.types';
import { getActiveMembership } from '../../auth/auth.types';

export const ActiveOrg = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    const activeOrganizationId = request.user?.activeOrganizationId;

    if (!activeOrganizationId) {
      throw new BadRequestException('No active organization selected');
    }
    if (!request.user || !getActiveMembership(request.user)) {
      throw new ForbiddenException(
        'You do not have active access to this organization',
      );
    }

    return activeOrganizationId;
  },
);
