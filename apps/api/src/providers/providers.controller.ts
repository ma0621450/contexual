import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AiProvider, MembershipRole } from '@contexual/database';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/auth.types';
import { ActiveOrg } from '../common/decorators/active-org.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  ConnectProviderDto,
  UpdateProviderModelsDto,
} from './dto/providers.dto';
import { ProvidersService } from './providers.service';

@Controller('organizations/providers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Get()
  getStatus(@ActiveOrg() organizationId: string) {
    return this.providersService.getStatus(organizationId);
  }

  @Get('models')
  @Roles(MembershipRole.ADMIN, MembershipRole.MEMBER)
  getModels() {
    return this.providersService.getAvailableModels();
  }

  @Post()
  @Roles(MembershipRole.ADMIN)
  @HttpCode(200)
  connect(
    @ActiveOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ConnectProviderDto,
  ) {
    return this.providersService.connect(
      organizationId,
      user.id,
      dto.provider,
      dto.apiKey,
      dto.defaultModel,
      dto.enabledModels,
    );
  }

  @Patch(':provider')
  @Roles(MembershipRole.ADMIN)
  @HttpCode(200)
  updateModels(
    @ActiveOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('provider', new ParseEnumPipe(AiProvider)) provider: AiProvider,
    @Body() dto: UpdateProviderModelsDto,
  ) {
    return this.providersService.updateModels(
      organizationId,
      user.id,
      provider,
      dto.enabledModels,
      dto.defaultModel,
    );
  }

  @Delete(':provider')
  @Roles(MembershipRole.ADMIN)
  @HttpCode(200)
  disconnect(
    @ActiveOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('provider', new ParseEnumPipe(AiProvider)) provider: AiProvider,
  ) {
    return this.providersService.disconnect(organizationId, user.id, provider);
  }
}
