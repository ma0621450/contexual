import { ConflictException, ForbiddenException } from '@nestjs/common';
import { InviteStatus } from '@contexual/database';
import { OnboardingService } from './onboarding.service';

describe('OnboardingService invitations', () => {
  const prisma = {
    invite: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    membership: {
      findUnique: jest.fn(),
    },
  };
  const service = new OnboardingService(
    prisma as never,
    {} as never,
    {} as never,
  );
  const invite = {
    id: 'invite-1',
    token: 'invite-token',
    email: 'invited@example.com',
    role: 'MEMBER',
    status: InviteStatus.PENDING,
    expiresAt: new Date(Date.now() + 60_000),
    organizationId: 'org-1',
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

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.invite.findUnique.mockResolvedValue(invite);
    prisma.membership.findUnique.mockResolvedValue(null);
  });

  it('includes organizationId in the public invite preview', async () => {
    await expect(service.getInvitePreview(invite.token)).resolves.toEqual({
      organizationId: invite.organization.id,
      organizationName: invite.organization.name,
      email: invite.email,
      role: invite.role,
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
});
