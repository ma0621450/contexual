import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import { AuthCookieService } from './auth-cookie.service';
import { hashPassword, isOtpValid, verifyPassword } from './auth.utils';
import type { AuthUser } from './auth.types';
import { SessionsService } from '../sessions/sessions.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly authCookieService: AuthCookieService,
    private readonly usersService: UsersService,
    private readonly sessionsService: SessionsService,
  ) {}

  async validateUser(
    email: string,
    password: string,
  ): Promise<AuthUser | null> {
    const user = await this.usersService.findByEmailWithMemberships(email);

    if (!user) {
      return null;
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return null;
    }

    return user;
  }

  async register(name: string, email: string, password: string, res: Response) {
    const passwordHash = await hashPassword(password);
    const user = await this.usersService.createUser(name, email, passwordHash);
    await this.sessionsService.createSession(user, res);

    return {
      redirectTo: '/verify-email',
      user: { id: user.id, email: user.email, name: user.name },
    };
  }

  async login(user: AuthUser, res: Response) {
    await this.sessionsService.createSession(user, res);

    return {
      redirectTo: this.authCookieService.getPostAuthRedirect(user),
      user: { id: user.id, email: user.email, name: user.name },
    };
  }

  async verifyEmail(user: AuthUser, otp: string, res: Response) {
    if (user.emailVerifiedAt) {
      return { redirectTo: '/onboarding' };
    }

    if (!isOtpValid(otp)) {
      throw new UnauthorizedException('Invalid verification code');
    }

    const updatedUser = await this.usersService.markEmailVerified(user.id);
    await this.sessionsService.createSession(updatedUser, res);

    return { redirectTo: '/onboarding' };
  }

  async refresh(refreshToken: string | undefined, res: Response) {
    return this.sessionsService.refresh(refreshToken, res);
  }

  async logout(refreshToken: string | undefined, res: Response) {
    return this.sessionsService.logout(refreshToken, res);
  }

  getMe(user: AuthUser) {
    return this.usersService.toProfile(user);
  }
}
