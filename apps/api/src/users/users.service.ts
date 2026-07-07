import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  getActiveMembership,
  type AuthUser,
  type AuthUserWithPassword,
} from '../auth/auth.types';

const MEMBERSHIP_SELECT = {
  select: { id: true, organizationId: true, role: true },
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
      data: { emailVerifiedAt: new Date() },
    });

    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { memberships: MEMBERSHIP_SELECT },
    });
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
