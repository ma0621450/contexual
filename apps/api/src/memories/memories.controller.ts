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
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActiveOrg } from '../common/decorators/active-org.decorator';
import { CreateMemoryDto, UpdateMemoryDto } from './dto/memories.dto';
import { MemoriesService } from './memories.service';

@Controller('memories')
@UseGuards(JwtAuthGuard)
export class MemoriesController {
  constructor(private readonly memoriesService: MemoriesService) {}

  @Get()
  list(@ActiveOrg() organizationId: string, @CurrentUser() user: AuthUser) {
    return this.memoriesService.list(organizationId, user.id);
  }

  @Post()
  create(
    @ActiveOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateMemoryDto,
  ) {
    return this.memoriesService.create(organizationId, user, dto);
  }

  @Patch(':id')
  update(
    @ActiveOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') memoryId: string,
    @Body() dto: UpdateMemoryDto,
  ) {
    return this.memoriesService.update(organizationId, user, memoryId, dto);
  }

  @Delete(':id')
  @HttpCode(200)
  remove(
    @ActiveOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') memoryId: string,
  ) {
    return this.memoriesService.remove(organizationId, user, memoryId);
  }
}
