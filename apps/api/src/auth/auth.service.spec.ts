import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import type { AuthUser } from './auth.types';
import { hashPassword } from './auth.utils';

describe('AuthService account settings', () => {
  const user: AuthUser = {
    id: 'user-1',
    email: 'member@example.com',
    name: 'Member',
    emailVerifiedAt: new Date(),
    sessionVersion: 0,
    activeOrganizationId: 'org-1',
    memberships: [],
  };

  const authCookieService = {
    clearAuthCookies: jest.fn(),
  };
  const usersService = {
    updateName: jest.fn(),
    toProfile: jest.fn(),
    findPasswordHash: jest.fn(),
    updatePassword: jest.fn(),
  };
  const sessionsService = {
    revokeAllUserRefreshTokens: jest.fn(),
  };
  const service = new AuthService(
    authCookieService as never,
    usersService as never,
    sessionsService as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('trims and updates the authenticated user name', async () => {
    const updated = { ...user, name: 'Updated Name' };
    usersService.updateName.mockResolvedValue(updated);
    usersService.toProfile.mockReturnValue({ id: user.id, name: updated.name });

    await expect(
      service.updateProfile(user, '  Updated Name  '),
    ).resolves.toEqual({ id: user.id, name: 'Updated Name' });
    expect(usersService.updateName).toHaveBeenCalledWith(
      user.id,
      'Updated Name',
    );
  });

  it('rejects an incorrect current password', async () => {
    usersService.findPasswordHash.mockResolvedValue(
      await hashPassword('current-password'),
    );

    await expect(
      service.changePassword(
        user,
        'wrong-password',
        'new-password',
        {} as Response,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(usersService.updatePassword).not.toHaveBeenCalled();
  });

  it('rejects reusing the current password', async () => {
    usersService.findPasswordHash.mockResolvedValue(
      await hashPassword('current-password'),
    );

    await expect(
      service.changePassword(
        user,
        'current-password',
        'current-password',
        {} as Response,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('changes the password, revokes sessions, and clears cookies', async () => {
    usersService.findPasswordHash.mockResolvedValue(
      await hashPassword('current-password'),
    );
    usersService.updatePassword.mockResolvedValue(undefined);
    sessionsService.revokeAllUserRefreshTokens.mockResolvedValue(undefined);
    const response = {} as Response;

    await expect(
      service.changePassword(
        user,
        'current-password',
        'new-password',
        response,
      ),
    ).resolves.toEqual({ ok: true, requiresLogin: true });

    expect(usersService.updatePassword).toHaveBeenCalledWith(
      user.id,
      expect.stringMatching(/^\$2[aby]\$/),
    );
    expect(sessionsService.revokeAllUserRefreshTokens).toHaveBeenCalledWith(
      user.id,
    );
    expect(authCookieService.clearAuthCookies).toHaveBeenCalledWith(response);
  });
});
