import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PLATFORM_JWT_STRATEGY } from '../strategies/platform-jwt.strategy';

@Injectable()
export class PlatformAuthGuard extends AuthGuard(PLATFORM_JWT_STRATEGY) {}
