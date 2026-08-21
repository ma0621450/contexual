import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PlatformRole } from '@contexual/database';
import { PLATFORM_ROLES_KEY } from '../decorators/platform-roles.decorator';
import { hasPlatformRole, type PlatformAdminContext } from '../platform.types';

@Injectable()
export class PlatformRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const minimum = this.reflector.getAllAndOverride<PlatformRole | undefined>(
      PLATFORM_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!minimum) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: PlatformAdminContext }>();
    const admin = request.user;

    if (!admin) {
      throw new ForbiddenException('Platform authentication required');
    }

    if (!hasPlatformRole(admin.role, minimum)) {
      throw new ForbiddenException(
        'Your platform role does not permit this action',
      );
    }

    return true;
  }
}
