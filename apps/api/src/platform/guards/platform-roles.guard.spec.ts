import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PlatformRole } from '@contexual/database';
import { PlatformRolesGuard } from './platform-roles.guard';
import type { PlatformAdminContext } from '../platform.types';

function contextFor(admin: PlatformAdminContext | undefined): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user: admin }) }),
  } as unknown as ExecutionContext;
}

function adminWith(role: PlatformRole): PlatformAdminContext {
  return {
    id: 'admin-1',
    email: 'staff@example.com',
    name: 'Staff',
    role,
    mustChangePassword: false,
  };
}

function guardRequiring(minimum: PlatformRole | undefined) {
  const reflector = {
    getAllAndOverride: () => minimum,
  } as unknown as Reflector;
  return new PlatformRolesGuard(reflector);
}

describe('PlatformRolesGuard', () => {
  it('allows handlers with no declared minimum role', () => {
    expect(guardRequiring(undefined).canActivate(contextFor(undefined))).toBe(
      true,
    );
  });

  it('treats platform roles as a hierarchy', () => {
    const guard = guardRequiring('OPERATOR');

    expect(guard.canActivate(contextFor(adminWith('OPERATOR')))).toBe(true);
    expect(guard.canActivate(contextFor(adminWith('OWNER')))).toBe(true);
    expect(() => guard.canActivate(contextFor(adminWith('SUPPORT')))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects requests without a platform admin', () => {
    expect(() =>
      guardRequiring('SUPPORT').canActivate(contextFor(undefined)),
    ).toThrow(ForbiddenException);
  });
});
