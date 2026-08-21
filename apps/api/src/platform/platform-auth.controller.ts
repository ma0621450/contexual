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
import type { Request, Response } from 'express';
import { CurrentPlatformAdmin } from './decorators/current-platform-admin.decorator';
import {
  PlatformChangePasswordDto,
  PlatformConfirmTotpDto,
  PlatformLoginDto,
} from './dto/platform.dto';
import { PlatformAuthGuard } from './guards/platform-auth.guard';
import { PlatformAuthService } from './platform-auth.service';
import type { PlatformAdminContext } from './platform.types';

function clientIp(req: Request): string | null {
  return req.ip ?? null;
}

@Controller('platform/auth')
export class PlatformAuthController {
  constructor(private readonly platformAuthService: PlatformAuthService) {}

  @Post('login')
  @HttpCode(200)
  login(
    @Body() dto: PlatformLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.platformAuthService.login(
      dto.email,
      dto.password,
      dto.totp,
      res,
      clientIp(req),
    );
  }

  @Post('totp/confirm')
  @HttpCode(200)
  confirmTotp(
    @Body() dto: PlatformConfirmTotpDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.platformAuthService.confirmTotp(
      dto.email,
      dto.password,
      dto.totp,
      res,
      clientIp(req),
    );
  }

  @Get('me')
  @UseGuards(PlatformAuthGuard)
  me(@CurrentPlatformAdmin() admin: PlatformAdminContext) {
    return admin;
  }

  @Post('password')
  @UseGuards(PlatformAuthGuard)
  @HttpCode(200)
  changePassword(
    @Body() dto: PlatformChangePasswordDto,
    @CurrentPlatformAdmin() admin: PlatformAdminContext,
    @Req() req: Request,
  ) {
    return this.platformAuthService.changePassword(
      admin,
      dto.currentPassword,
      dto.newPassword,
      clientIp(req),
    );
  }

  @Post('logout')
  @UseGuards(PlatformAuthGuard)
  @HttpCode(200)
  logout(
    @CurrentPlatformAdmin() admin: PlatformAdminContext,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.platformAuthService.logout(admin, res, clientIp(req));
  }
}
