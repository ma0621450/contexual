import { SetMetadata } from '@nestjs/common';
import type { PlatformRole } from '@contexual/database';

export const PLATFORM_ROLES_KEY = 'platformRoles';

/** Declares the minimum platform role required to reach a handler. */
export const PlatformRoles = (minimum: PlatformRole) =>
  SetMetadata(PLATFORM_ROLES_KEY, minimum);
