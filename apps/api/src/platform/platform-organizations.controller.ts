import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { PlatformRole } from '@contexual/database';
import type { Request } from 'express';
import { CurrentPlatformAdmin } from './decorators/current-platform-admin.decorator';
import { PlatformRoles } from './decorators/platform-roles.decorator';
import { ListOrganizationsQueryDto } from './dto/platform.dto';
import { PlatformAuthGuard } from './guards/platform-auth.guard';
import { PlatformPasswordGuard } from './guards/platform-password.guard';
import { PlatformRolesGuard } from './guards/platform-roles.guard';
import { PlatformAuditService } from './platform-audit.service';
import { PlatformOrganizationsService } from './platform-organizations.service';
import type { PlatformAdminContext } from './platform.types';

@Controller('platform/organizations')
@UseGuards(PlatformAuthGuard, PlatformPasswordGuard, PlatformRolesGuard)
@PlatformRoles(PlatformRole.SUPPORT)
export class PlatformOrganizationsController {
  constructor(
    private readonly organizations: PlatformOrganizationsService,
    private readonly audit: PlatformAuditService,
  ) {}

  @Get()
  list(@Query() query: ListOrganizationsQueryDto) {
    return this.organizations.list(query);
  }

  @Get(':id')
  async get(
    @Param('id') id: string,
    @CurrentPlatformAdmin() admin: PlatformAdminContext,
    @Req() req: Request,
  ) {
    const organization = await this.organizations.get(id);
    await this.audit.record({
      platformAdminId: admin.id,
      action: 'platform.organization_viewed',
      targetType: 'Organization',
      targetId: id,
      ipAddress: req.ip ?? null,
    });
    return organization;
  }
}
