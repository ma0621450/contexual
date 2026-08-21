import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { ImpersonationInterceptor } from './impersonation.interceptor';
import type { AuthUser } from '../../auth/auth.types';

const impersonatedUser = {
  id: 'user-1',
  email: 'member@example.com',
  name: 'Member',
  emailVerifiedAt: new Date(),
  sessionVersion: 1,
  activeOrganizationId: 'org-1',
  memberships: [],
  impersonation: {
    grantId: 'grant-1',
    platformAdminId: 'admin-1',
    organizationId: 'org-1',
  },
} satisfies AuthUser;

function contextFor(
  method: string,
  path: string,
  user?: AuthUser,
): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => ({ method, path, url: path, user }),
    }),
  } as unknown as ExecutionContext;
}

const nextHandler: CallHandler = { handle: () => of('allowed') };

async function run(context: ExecutionContext) {
  const interceptor = new ImpersonationInterceptor();
  const result = interceptor.intercept(context, nextHandler);
  return new Promise((resolve, reject) => {
    result.subscribe({ next: resolve, error: reject });
  });
}

describe('ImpersonationInterceptor', () => {
  it('ignores ordinary sessions', async () => {
    const ordinaryUser = { ...impersonatedUser, impersonation: undefined };
    await expect(
      run(contextFor('POST', '/api/auth/change-password', ordinaryUser)),
    ).resolves.toBe('allowed');
  });

  it('ignores unauthenticated requests', async () => {
    await expect(run(contextFor('POST', '/api/auth/login'))).resolves.toBe(
      'allowed',
    );
  });

  it.each([
    ['POST', '/api/auth/change-password'],
    ['PATCH', '/api/auth/profile'],
    ['POST', '/api/providers'],
    ['DELETE', '/api/providers/OPENAI'],
    ['POST', '/api/billing/checkout'],
    ['DELETE', '/api/organizations/members/membership-1'],
    ['POST', '/api/onboarding/transfer-admin'],
  ])('blocks %s %s during impersonation', async (method, path) => {
    await expect(
      run(contextFor(method, path, impersonatedUser)),
    ).rejects.toThrow(ForbiddenException);
  });

  it.each([
    ['GET', '/api/providers'],
    ['POST', '/api/chat/conversations'],
    ['GET', '/api/organizations/members'],
    ['POST', '/api/files/upload'],
  ])('allows %s %s during impersonation', async (method, path) => {
    await expect(run(contextFor(method, path, impersonatedUser))).resolves.toBe(
      'allowed',
    );
  });

  it('matches paths that carry a query string', async () => {
    const context = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'DELETE',
          path: '',
          url: '/api/providers/OPENAI?force=true',
          user: impersonatedUser,
        }),
      }),
    } as unknown as ExecutionContext;

    await expect(run(context)).rejects.toThrow(ForbiddenException);
  });
});
