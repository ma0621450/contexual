import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { PlatformAdminContext } from '../platform.types';

/**
 * Keeps a seeded or reset account from reaching platform data until its
 * password has been rotated. Applied to the data-bearing controllers rather
 * than globally, because the rotation endpoint itself has to stay reachable.
 */
@Injectable()
export class PlatformPasswordGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: PlatformAdminContext }>();

    if (request.user?.mustChangePassword) {
      throw new ForbiddenException(
        'Choose a new password before using the platform console',
      );
    }

    return true;
  }
}
