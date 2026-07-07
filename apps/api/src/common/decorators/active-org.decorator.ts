import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';
import type { AuthUser } from '../../auth/auth.types';

export const ActiveOrg = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    const activeOrganizationId = request.user?.activeOrganizationId;

    if (!activeOrganizationId) {
      throw new BadRequestException('No active organization selected');
    }

    return activeOrganizationId;
  },
);
