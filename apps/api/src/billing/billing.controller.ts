import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { MembershipRole } from '@contexual/database';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/auth.types';
import { ActiveOrg } from '../common/decorators/active-org.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { BillingService } from './billing.service';
import { CheckoutDto } from './dto/billing.dto';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(MembershipRole.ADMIN)
  getStatus(@ActiveOrg() organizationId: string) {
    return this.billingService.getStatus(organizationId);
  }

  @Post('checkout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(MembershipRole.ADMIN)
  @HttpCode(200)
  checkout(
    @ActiveOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CheckoutDto,
  ) {
    return this.billingService.createCheckoutSession(
      organizationId,
      user.id,
      dto.planTier,
    );
  }

  @Post('portal')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(MembershipRole.ADMIN)
  @HttpCode(200)
  portal(@ActiveOrg() organizationId: string) {
    return this.billingService.createPortalSession(organizationId);
  }

  @Post('webhook')
  @HttpCode(200)
  webhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    return this.billingService.handleWebhook(request.rawBody, signature);
  }
}
