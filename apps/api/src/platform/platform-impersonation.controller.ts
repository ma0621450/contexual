import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { PlatformRole } from '@contexual/database';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/auth.types';
import { CurrentPlatformAdmin } from './decorators/current-platform-admin.decorator';
import { PlatformRoles } from './decorators/platform-roles.decorator';
import {
  RedeemImpersonationDto,
  StartImpersonationDto,
} from './dto/platform.dto';
import { PlatformAuthGuard } from './guards/platform-auth.guard';
import { PlatformPasswordGuard } from './guards/platform-password.guard';
import { PlatformRolesGuard } from './guards/platform-roles.guard';
import { PlatformImpersonationService } from './platform-impersonation.service';
import type { PlatformAdminContext } from './platform.types';

@Controller('platform/impersonation')
export class PlatformImpersonationController {
  constructor(private readonly impersonation: PlatformImpersonationService) {}

  @Post()
  @UseGuards(PlatformAuthGuard, PlatformPasswordGuard, PlatformRolesGuard)
  @PlatformRoles(PlatformRole.OPERATOR)
  @HttpCode(200)
  start(
    @Body() dto: StartImpersonationDto,
    @CurrentPlatformAdmin() admin: PlatformAdminContext,
    @Req() req: Request,
  ) {
    return this.impersonation.start(admin, dto, req.ip ?? null);
  }

  @Get()
  @UseGuards(PlatformAuthGuard, PlatformPasswordGuard, PlatformRolesGuard)
  @PlatformRoles(PlatformRole.SUPPORT)
  listRecent() {
    return this.impersonation.listRecent();
  }

  /**
   * Unauthenticated by design: the single-use token is the credential, and it
   * is exchanged on the customer-facing origin so the resulting cookie lands
   * on the right host.
   */
  @Post('redeem')
  @HttpCode(200)
  redeem(
    @Body() dto: RedeemImpersonationDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.impersonation.redeem(dto.token, res);
  }

  @Post('end')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  end(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.impersonation.end(user, res);
  }
}
