import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { PlatformAdminContext } from '../platform.types';

export const CurrentPlatformAdmin = createParamDecorator(
  (_data: unknown, context: ExecutionContext): PlatformAdminContext => {
    const request = context
      .switchToHttp()
      .getRequest<{ user: PlatformAdminContext }>();
    return request.user;
  },
);
