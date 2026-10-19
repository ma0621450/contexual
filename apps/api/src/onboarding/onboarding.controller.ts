import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { clientIp } from '../config/trust-proxy';
import { RATE_LIMITS } from '../rate-limit/rate-limit.policies';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/auth.types';
import {
  CreateOrganizationDto,
  InviteSignupDto,
  JoinOrganizationDto,
  SlugAvailabilityQueryDto,
  SlugSuggestionQueryDto,
  SwitchOrganizationDto,
  TransferAdminDto,
} from './dto/onboarding.dto';
import { OnboardingService } from './onboarding.service';

@Controller('onboarding')
export class OnboardingController {
  constructor(
    private readonly onboardingService: OnboardingService,
    private readonly rateLimits: RateLimitService,
  ) {}

  @Get('organizations')
  @UseGuards(JwtAuthGuard)
  listOrganizations(@CurrentUser() user: AuthUser) {
    return this.onboardingService.listOrganizations(user.id);
  }

  @Post('switch-organization')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  switchOrganization(
    @Body() dto: SwitchOrganizationDto,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.onboardingService.switchOrganization(
      user,
      dto.organizationId,
      res,
    );
  }

  @Post('transfer-admin')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  transferAdmin(
    @Body() dto: TransferAdminDto,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.onboardingService.transferAdmin(user, dto.targetUserId, res);
  }

  @Post('leave-organization')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  leaveOrganization(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.onboardingService.leaveOrganization(user, res);
  }

  @Post('create-organization')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  createOrganization(
    @Body() dto: CreateOrganizationDto,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.onboardingService.createOrganization(user, dto, res);
  }

  @Get('slug-availability')
  @UseGuards(JwtAuthGuard)
  checkSlugAvailability(@Query() query: SlugAvailabilityQueryDto) {
    return this.onboardingService.checkSlugAvailability(query.slug);
  }

  @Get('slug-suggestion')
  @UseGuards(JwtAuthGuard)
  suggestSlug(@Query() query: SlugSuggestionQueryDto) {
    return this.onboardingService.suggestSlug(query.name);
  }

  @Post('invite-signup')
  @HttpCode(200)
  async inviteSignup(
    @Body() dto: InviteSignupDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.rateLimits.consume(RATE_LIMITS.inviteSignupIp, clientIp(req));
    return this.onboardingService.inviteSignup(dto, res);
  }

  @Post('join-organization')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async joinOrganization(
    @Body() dto: JoinOrganizationDto,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.rateLimits.consume(RATE_LIMITS.inviteJoinUser, user.id);
    return this.onboardingService.joinOrganization(user, dto.token, res);
  }

  @Get('invite-preview')
  async getInvitePreview(@Query('token') token: string, @Req() req: Request) {
    await this.rateLimits.consume(RATE_LIMITS.invitePreviewIp, clientIp(req));
    return this.onboardingService.getInvitePreview(token);
  }
}
