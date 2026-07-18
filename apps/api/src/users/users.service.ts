import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  getActiveMembership,
  type AuthUser,
  type AuthUserWithPassword,
} from '../auth/auth.types';
import {
  hashOtp,
  hashPasswordResetToken,
  OTP_EXPIRY_MINUTES,
  PASSWORD_RESET_EXPIRY_HOURS,
} from '../auth/auth.utils';

const MEMBERSHIP_SELECT = {
  select: { id: true, organizationId: true, role: true, suspended: true },
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmailWithMemberships(
    email: string,
  ): Promise<AuthUserWithPassword | null> {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { memberships: MEMBERSHIP_SELECT },
    });
  }

  async findByIdWithMemberships(userId: string): Promise<AuthUser | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: { memberships: MEMBERSHIP_SELECT },
    });
  }

  async findByIdWithMembershipsOrThrow(userId: string): Promise<AuthUser> {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { memberships: MEMBERSHIP_SELECT },
    });
  }

  async createUser(
    name: string,
    email: string,
    passwordHash: string,
  ): Promise<AuthUser> {
    const normalizedEmail = email.toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    return this.prisma.user.create({
      data: { name, email: normalizedEmail, passwordHash },
      include: { memberships: MEMBERSHIP_SELECT },
    });
  }

  async markEmailVerified(userId: string): Promise<AuthUser> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        emailVerifiedAt: new Date(),
        emailVerificationOtpHash: null,
        emailVerificationOtpExpiresAt: null,
        emailVerificationOtpSentAt: null,
      },
    });

    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { memberships: MEMBERSHIP_SELECT },
    });
  }

  async setEmailVerificationOtp(userId: string, otp: string): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + OTP_EXPIRY_MINUTES);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        emailVerificationOtpHash: hashOtp(otp),
        emailVerificationOtpExpiresAt: expiresAt,
        emailVerificationOtpSentAt: new Date(),
      },
    });
  }

  async findForOtpVerification(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        emailVerificationOtpHash: true,
        emailVerificationOtpExpiresAt: true,
        emailVerificationOtpSentAt: true,
      },
    });
  }

  async findByEmailForPasswordReset(email: string) {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, email: true, name: true },
    });
  }

  async setPasswordResetToken(userId: string, token: string): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + PASSWORD_RESET_EXPIRY_HOURS);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordResetTokenHash: hashPasswordResetToken(token),
        passwordResetTokenExpiresAt: expiresAt,
      },
    });
  }

  async findByPasswordResetToken(token: string) {
    return this.prisma.user.findFirst({
      where: {
        passwordResetTokenHash: hashPasswordResetToken(token),
        passwordResetTokenExpiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        passwordResetTokenHash: null,
        passwordResetTokenExpiresAt: null,
        sessionVersion: { increment: 1 },
      },
    });
  }

  async updateName(userId: string, name: string): Promise<AuthUser> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { name },
      include: { memberships: MEMBERSHIP_SELECT },
    });
  }

  async findPasswordHash(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    return user?.passwordHash ?? null;
  }

  toProfile(user: AuthUser) {
    const activeMembership = getActiveMembership(user);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerifiedAt: user.emailVerifiedAt,
      activeOrganizationId: user.activeOrganizationId,
      role: activeMembership?.role ?? null,
      memberships: user.memberships,
    };
  }
}
