import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InviteStatus } from '@contexual/database';
import { OnboardingService } from './onboarding.service';
import { hashInviteEmailProof } from './invite-proof';

type UserCreateData = { email: string; emailVerifiedAt?: Date };

describe('OnboardingService invitations', () => {
  const tx = {
    organization: { update: jest.fn() },
    invite: { findUnique: jest.fn(), update: jest.fn() },
    membership: { count: jest.fn(), create: jest.fn() },
    user: {
      create: jest.fn<Promise<{ id: string }>, [{ data: UserCreateData }]>(),
    },
    auditLog: { create: jest.fn() },
  };
  const prisma = {
    invite: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    membership: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const usersService = {
    findByIdWithMembershipsOrThrow: jest.fn(),
    setEmailVerificationOtp: jest.fn(),
  };
  const sessionsService = { createSession: jest.fn() };
  const mailService = { sendVerificationOtp: jest.fn() };
  const service = new OnboardingService(
    prisma as never,
    usersService as never,
    sessionsService as never,
    mailService as never,
  );
  const proof = 'emailed-proof-secret';
  const invite = {
    id: 'invite-1',
    token: 'invite-token',
    email: 'invited@example.com',
    role: 'MEMBER',
    status: InviteStatus.PENDING,
    expiresAt: new Date(Date.now() + 60_000),
    organizationId: 'org-1',
    emailProofHash: hashInviteEmailProof(proof),
    organization: {
      id: 'org-1',
      name: 'Invited Workspace',
      planTier: 'FREE',
    },
  };
  const user = {
    id: 'user-1',
    email: invite.email,
    emailVerifiedAt: new Date(),
  };
  const signup = {
    token: invite.token,
    name: 'Invited Person',
    password: 'password123',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.invite.findUnique.mockResolvedValue(invite);
    prisma.membership.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);
    tx.invite.findUnique.mockResolvedValue(invite);
    tx.membership.count.mockResolvedValue(1);
    tx.user.create.mockResolvedValue({ id: 'new-user' });
    usersService.findByIdWithMembershipsOrThrow.mockResolvedValue({
      id: 'new-user',
    });
  });

  it('includes organizationId and account existence in the invite preview', async () => {
    await expect(service.getInvitePreview(invite.token)).resolves.toEqual({
      organizationId: invite.organization.id,
      organizationName: invite.organization.name,
      email: invite.email,
      role: invite.role,
      hasAccount: false,
    });
  });

  it('keeps invite email matching enforced', async () => {
    await expect(
      service.joinOrganization(
        { ...user, email: 'admin@example.com' } as never,
        invite.token,
        {} as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.membership.findUnique).not.toHaveBeenCalled();
  });

  it('rejects an existing organization membership', async () => {
    prisma.membership.findUnique.mockResolvedValue({ id: 'membership-1' });

    await expect(
      service.joinOrganization(user as never, invite.token, {} as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates a verified member in one transaction when the emailed proof is valid', async () => {
    const result = await service.inviteSignup(
      { ...signup, proof },
      {} as never,
    );

    expect(result).toEqual(
      expect.objectContaining({ joined: true, redirectTo: '/dashboard' }),
    );
    expect(tx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: invite.email,
          emailVerifiedAt: expect.any(Date) as Date,
          activeOrganizationId: invite.organizationId,
        }) as object,
      }),
    );
    expect(tx.membership.create).toHaveBeenCalled();
    expect(tx.invite.update).toHaveBeenCalledWith({
      where: { id: invite.id },
      data: { status: InviteStatus.ACCEPTED },
    });
    expect(tx.auditLog.create).toHaveBeenCalled();
    expect(mailService.sendVerificationOtp).not.toHaveBeenCalled();
  });

  it('requires an email code when the proof is missing or wrong', async () => {
    for (const attempt of [undefined, 'wrong-proof']) {
      jest.clearAllMocks();
      tx.user.create.mockResolvedValue({ id: 'new-user' });
      usersService.findByIdWithMembershipsOrThrow.mockResolvedValue({
        id: 'new-user',
      });

      const result = await service.inviteSignup(
        { ...signup, proof: attempt },
        {} as never,
      );

      expect(result.joined).toBe(false);
      expect(result.redirectTo).toContain('/verify-email');
      const createArgs = tx.user.create.mock.calls[0]?.[0];
      expect(createArgs?.data.emailVerifiedAt).toBeUndefined();
      expect(tx.membership.create).not.toHaveBeenCalled();
      expect(tx.invite.update).not.toHaveBeenCalled();
      expect(mailService.sendVerificationOtp).toHaveBeenCalled();
    }
  });

  it('ignores any client-supplied email and uses the invited address', async () => {
    await service.inviteSignup(
      { ...signup, proof, email: 'attacker@example.com' } as never,
      {} as never,
    );
    const createArgs = tx.user.create.mock.calls[0]?.[0];
    expect(createArgs?.data.email).toBe(invite.email);
  });

  it('sends existing accounts to sign in instead of creating a user', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

    await expect(
      service.inviteSignup({ ...signup, proof }, {} as never),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it.each([
    ['revoked', { status: InviteStatus.REVOKED }],
    ['accepted', { status: InviteStatus.ACCEPTED }],
    ['expired', { expiresAt: new Date(Date.now() - 1_000) }],
  ])('rejects %s invites', async (_label, override) => {
    prisma.invite.findUnique.mockResolvedValue({ ...invite, ...override });

    await expect(
      service.inviteSignup({ ...signup, proof }, {} as never),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('rejects an invite that was used concurrently', async () => {
    tx.invite.findUnique.mockResolvedValue({
      ...invite,
      status: InviteStatus.ACCEPTED,
    });

    await expect(
      service.inviteSignup({ ...signup, proof }, {} as never),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('enforces the member limit', async () => {
    tx.membership.count.mockResolvedValue(3);

    await expect(
      service.inviteSignup({ ...signup, proof }, {} as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('OnboardingService workspace URLs', () => {
  const prisma = {
    organization: { findUnique: jest.fn() },
  };
  const service = new OnboardingService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.organization.findUnique.mockResolvedValue(null);
  });

  it('reports available, taken, reserved, and invalid slugs', async () => {
    await expect(service.checkSlugAvailability('acme-studio')).resolves.toEqual(
      { slug: 'acme-studio', available: true },
    );

    prisma.organization.findUnique.mockResolvedValue({ id: 'org' });
    await expect(
      service.checkSlugAvailability('acme-studio'),
    ).resolves.toMatchObject({ available: false, reason: 'taken' });

    await expect(service.checkSlugAvailability('admin')).resolves.toMatchObject(
      { available: false, reason: 'reserved' },
    );
    await expect(service.checkSlugAvailability('ab')).resolves.toMatchObject({
      available: false,
      reason: 'invalid',
    });
    await expect(
      service.checkSlugAvailability('bad--slug'),
    ).resolves.toMatchObject({ available: false, reason: 'invalid' });
  });

  it('rejects an invalid custom slug before creating the workspace', async () => {
    await expect(
      service.createOrganization(
        { id: 'user-1', emailVerifiedAt: new Date() } as never,
        { name: 'Acme', slug: 'Not A Slug' },
        {} as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
