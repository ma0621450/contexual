import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { PlatformPasswordGuard } from './platform-password.guard';
import type { PlatformAdminContext } from '../platform.types';

function contextFor(admin: Partial<PlatformAdminContext> | undefined) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user: admin }) }),
  } as unknown as ExecutionContext;
}

describe('PlatformPasswordGuard', () => {
  const guard = new PlatformPasswordGuard();

  it('allows an admin whose password has been rotated', () => {
    expect(guard.canActivate(contextFor({ mustChangePassword: false }))).toBe(
      true,
    );
  });

  it('blocks an admin still on a temporary password', () => {
    expect(() =>
      guard.canActivate(contextFor({ mustChangePassword: true })),
    ).toThrow(ForbiddenException);
  });

  it('defers to the auth guard when no admin is attached', () => {
    expect(guard.canActivate(contextFor(undefined))).toBe(true);
  });
});
