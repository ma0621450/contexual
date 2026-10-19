import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthCookieService } from './auth-cookie.service';
import {
  generateOtp,
  generatePasswordResetToken,
  hashOtp,
  hashPassword,
  hashPasswordResetToken,
  isDevOtpAllowed,
  verificationIdempotencyKey,
  verifyAgainstDummyHash,
  verifyPassword,
} from './auth.utils';
import type { AuthUser } from './auth.types';
import { MailService } from '../mail/mail.service';
import { RATE_LIMITS } from '../rate-limit/rate-limit.policies';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { SessionsService } from '../sessions/sessions.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly authCookieService: AuthCookieService,
    private readonly usersService: UsersService,
    private readonly sessionsService: SessionsService,
    private readonly mailService: MailService,
    private readonly rateLimits: RateLimitService,
  ) {}

  private webUrl(): string {
    return process.env.WEB_URL ?? 'http://localhost:3000';
  }

  async validateUser(
    email: string,
    password: string,
    ip: string,
  ): Promise<AuthUser | null> {
    const account = email.trim().toLowerCase();
    const accountFromIp = `${account}|${ip}`;
    await this.rateLimits.consume(RATE_LIMITS.loginIp, ip);
    await this.rateLimits.assertAvailable(
      RATE_LIMITS.loginAccountIp,
      accountFromIp,
    );
    await this.rateLimits.assertAvailable(RATE_LIMITS.loginAccount, account);

    const user = await this.usersService.findByEmailWithMemberships(email);
    const valid = user
      ? await verifyPassword(password, user.passwordHash)
      : await verifyAgainstDummyHash(password);

    if (!user || !valid) {
      await this.rateLimits.hit(RATE_LIMITS.loginAccountIp, accountFromIp);
      await this.rateLimits.hit(RATE_LIMITS.loginAccount, account);
      return null;
    }

    await this.rateLimits.reset(RATE_LIMITS.loginAccountIp, accountFromIp);
    await this.rateLimits.reset(RATE_LIMITS.loginAccount, account);
    return user;
  }

  async register(
    name: string,
    email: string,
    password: string,
    res: Response,
    ip: string,
  ) {
    await this.rateLimits.consume(RATE_LIMITS.registerIp, ip);
    const passwordHash = await hashPassword(password);
    const user = await this.usersService.createUser(name, email, passwordHash);

    const otp = generateOtp();
    await this.usersService.setEmailVerificationOtp(user.id, otp);
    await this.mailService.sendVerificationOtp(
      user.email,
      user.name,
      otp,
      verificationIdempotencyKey(user.id),
    );

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

  async verifyEmail(user: AuthUser, otp: string, res: Response, ip: string) {
    if (user.emailVerifiedAt) {
      return { redirectTo: '/onboarding' };
    }

    await this.rateLimits.consume(RATE_LIMITS.otpVerifyIp, ip);
    await this.rateLimits.assertAvailable(RATE_LIMITS.otpVerifyUser, user.id);
    await this.rateLimits.assertAvailable(
      RATE_LIMITS.otpVerifyUserDaily,
      user.id,
    );

    const mailConfigured = this.mailService.isConfigured();
    if (!isDevOtpAllowed(otp, mailConfigured)) {
      const record = await this.usersService.findForOtpVerification(user.id);
      if (
        !record?.emailVerificationOtpHash ||
        !record.emailVerificationOtpExpiresAt ||
        record.emailVerificationOtpExpiresAt < new Date() ||
        record.emailVerificationOtpHash !== hashOtp(otp)
      ) {
        await this.rateLimits.hit(RATE_LIMITS.otpVerifyUser, user.id);
        await this.rateLimits.hit(RATE_LIMITS.otpVerifyUserDaily, user.id);
        throw new UnauthorizedException('Invalid or expired verification code');
      }
    }

    const updatedUser = await this.usersService.markEmailVerified(user.id);
    await this.rateLimits.reset(RATE_LIMITS.otpVerifyUser, user.id);
    await this.sessionsService.createSession(updatedUser, res);

    return { redirectTo: '/onboarding' };
  }

  async resendVerification(user: AuthUser, ip: string) {
    if (user.emailVerifiedAt) {
      return { ok: true };
    }

    const verification = await this.usersService.findForOtpVerification(
      user.id,
    );
    if (
      verification?.emailVerificationOtpSentAt &&
      Date.now() - verification.emailVerificationOtpSentAt.getTime() < 60_000
    ) {
      throw new BadRequestException(
        'Please wait one minute before requesting another code',
      );
    }

    await this.rateLimits.consume(RATE_LIMITS.otpSendIp, ip);
    await this.rateLimits.consume(RATE_LIMITS.otpSendUser, user.id);

    const otp = generateOtp();
    await this.usersService.setEmailVerificationOtp(user.id, otp);
    await this.rateLimits.reset(RATE_LIMITS.otpVerifyUser, user.id);
    await this.mailService.sendVerificationOtp(
      user.email,
      user.name,
      otp,
      verificationIdempotencyKey(user.id),
    );
    return { ok: true };
  }

  async forgotPassword(email: string, ip: string) {
    await this.rateLimits.consume(RATE_LIMITS.resetRequestIp, ip);
    const perAccount = await this.rateLimits.hit(
      RATE_LIMITS.resetRequestAccount,
      email,
    );
    const user =
      perAccount.count > RATE_LIMITS.resetRequestAccount.limit
        ? null
        : await this.usersService.findByEmailForPasswordReset(email);

    if (user) {
      const token = generatePasswordResetToken();
      await this.usersService.setPasswordResetToken(user.id, token);
      await this.mailService.sendPasswordReset({
        to: user.email,
        name: user.name,
        resetUrl: `${this.webUrl()}/reset-password?token=${encodeURIComponent(token)}`,
        idempotencyKey: `password-reset:${user.id}:${hashPasswordResetToken(token)}`,
      });
    }

    return {
      message:
        'If an account exists for this email, a reset link will be sent.',
    };
  }

  async resetPassword(token: string, password: string, ip: string) {
    await this.rateLimits.consume(RATE_LIMITS.resetSubmitIp, ip);
    const user = await this.usersService.findByPasswordResetToken(token);

    if (!user) {
      throw new BadRequestException(
        'This reset link is invalid or has expired',
      );
    }

    const passwordHash = await hashPassword(password);
    await this.usersService.updatePassword(user.id, passwordHash);
    await this.sessionsService.revokeAllUserRefreshTokens(user.id);

    return { ok: true };
  }

  async updateProfile(user: AuthUser, name: string) {
    const updatedUser = await this.usersService.updateName(
      user.id,
      name.trim(),
    );
    return this.usersService.toProfile(updatedUser);
  }

  async changePassword(
    user: AuthUser,
    currentPassword: string,
    newPassword: string,
    res: Response,
  ) {
    const passwordHash = await this.usersService.findPasswordHash(user.id);
    if (
      !passwordHash ||
      !(await verifyPassword(currentPassword, passwordHash))
    ) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    if (await verifyPassword(newPassword, passwordHash)) {
      throw new BadRequestException(
        'New password must be different from current password',
      );
    }

    await this.usersService.updatePassword(
      user.id,
      await hashPassword(newPassword),
    );
    await this.sessionsService.revokeAllUserRefreshTokens(user.id);
    this.authCookieService.clearAuthCookies(res);

    return { ok: true, requiresLogin: true };
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
