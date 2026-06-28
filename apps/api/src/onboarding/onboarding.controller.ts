import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/auth.types';
import {
  CreateOrganizationDto,
  JoinOrganizationDto,
} from './dto/onboarding.dto';
import { OnboardingService } from './onboarding.service';

@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Post('create-organization')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  createOrganization(
    @Body() dto: CreateOrganizationDto,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.onboardingService.createOrganization(user, dto.name, res);
  }

  @Post('join-organization')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  joinOrganization(
    @Body() dto: JoinOrganizationDto,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.onboardingService.joinOrganization(user, dto.token, res);
  }

  @Get('invite-preview')
  getInvitePreview(@Query('token') token: string) {
    return this.onboardingService.getInvitePreview(token);
  }
}
