import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { MembershipRole } from '@contexual/database';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/auth.types';
import { ActiveOrg } from '../common/decorators/active-org.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  ChangePlanDto,
  CreateInviteDto,
  SetOrganizationLimitsDto,
  SetSpendLimitDto,
  SetTokenLimitDto,
  SuspendMemberDto,
  UpdateMemberRoleDto,
} from './dto/members.dto';
import { MembersService } from './members.service';

@Controller('organizations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Get('overview')
  getOverview(@ActiveOrg() organizationId: string) {
    return this.membersService.getOverview(organizationId);
  }

  @Get('members')
  listMembers(@ActiveOrg() organizationId: string) {
    return this.membersService.listMembers(organizationId);
  }

  @Get('usage')
  @Roles(MembershipRole.ADMIN)
  getUsage(@ActiveOrg() organizationId: string) {
    return this.membersService.getUsage(organizationId);
  }

  @Get('usage/me')
  getMyUsage(
    @ActiveOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.membersService.getMyUsage(organizationId, user.id);
  }

  @Get('audit-logs')
  @Roles(MembershipRole.ADMIN)
  listAuditLogs(@ActiveOrg() organizationId: string) {
    return this.membersService.listAuditLogs(organizationId);
  }

  @Patch('plan')
  @Roles(MembershipRole.ADMIN)
  changePlan(
    @ActiveOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePlanDto,
  ) {
    return this.membersService.changePlan(
      organizationId,
      user.id,
      dto.planTier,
    );
  }

  @Get('invites')
  @Roles(MembershipRole.ADMIN)
  listInvites(@ActiveOrg() organizationId: string) {
    return this.membersService.listInvites(organizationId);
  }

  @Post('invites')
  @Roles(MembershipRole.ADMIN)
  createInvite(
    @ActiveOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateInviteDto,
  ) {
    return this.membersService.createInvite(
      organizationId,
      user.id,
      dto.email,
      dto.role,
    );
  }

  @Delete('invites/:id')
  @Roles(MembershipRole.ADMIN)
  @HttpCode(200)
  revokeInvite(
    @ActiveOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') inviteId: string,
  ) {
    return this.membersService.revokeInvite(organizationId, user.id, inviteId);
  }

  @Patch('members/:userId/role')
  @Roles(MembershipRole.ADMIN)
  changeRole(
    @ActiveOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('userId') targetUserId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.membersService.changeRole(
      organizationId,
      user.id,
      targetUserId,
      dto.role,
    );
  }

  @Patch('members/:userId/suspend')
  @Roles(MembershipRole.ADMIN)
  suspendMember(
    @ActiveOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('userId') targetUserId: string,
    @Body() dto: SuspendMemberDto,
  ) {
    return this.membersService.suspendMember(
      organizationId,
      user.id,
      targetUserId,
      dto.suspended,
    );
  }

  @Patch('members/:userId/spend-limit')
  @Roles(MembershipRole.ADMIN)
  setSpendLimit(
    @ActiveOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('userId') targetUserId: string,
    @Body() dto: SetSpendLimitDto,
  ) {
    return this.membersService.setSpendLimit(
      organizationId,
      user.id,
      targetUserId,
      dto.limitCents,
    );
  }

  @Patch('members/:userId/token-limit')
  @Roles(MembershipRole.ADMIN)
  setTokenLimit(
    @ActiveOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('userId') targetUserId: string,
    @Body() dto: SetTokenLimitDto,
  ) {
    return this.membersService.setTokenLimit(
      organizationId,
      user.id,
      targetUserId,
      dto.tokenLimit,
    );
  }

  @Patch('usage-limits')
  @Roles(MembershipRole.ADMIN)
  setOrganizationLimits(
    @ActiveOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SetOrganizationLimitsDto,
  ) {
    return this.membersService.setOrganizationLimits(
      organizationId,
      user.id,
      dto,
    );
  }

  @Delete('members/:userId')
  @Roles(MembershipRole.ADMIN)
  @HttpCode(200)
  removeMember(
    @ActiveOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('userId') targetUserId: string,
  ) {
    return this.membersService.removeMember(
      organizationId,
      user.id,
      targetUserId,
    );
  }
}
