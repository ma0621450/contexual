import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotImplementedException,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import {
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { REFRESH_TOKEN_COOKIE } from './auth.types';
import type { AuthUser } from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private getRefreshTokenFromRequest(req: Request): string | undefined {
    const rawToken: unknown = req.cookies?.[REFRESH_TOKEN_COOKIE];
    return typeof rawToken === 'string' ? rawToken : undefined;
  }

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.register(dto.name, dto.email, dto.password, res);
  }

  @Post('login')
  @UseGuards(LocalAuthGuard)
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    void dto;
    return this.authService.login(user, res);
  }

  @Post('verify-email')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async verifyEmail(
    @Body() dto: VerifyEmailDto,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.verifyEmail(user, dto.otp, res);
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.refresh(this.getRefreshTokenFromRequest(req), res);
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.authService.logout(this.getRefreshTokenFromRequest(req), res);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: AuthUser) {
    return this.authService.getMe(user);
  }

  // TODO: Generate reset token, persist it, and send reset email.
  @Post('forgot-password')
  @HttpCode(200)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    void dto;
    return {
      message:
        'If an account exists for this email, a reset link will be sent.',
    };
  }

  // TODO: Validate reset token from email and update user password hash.
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    void dto;
    throw new NotImplementedException('Password reset is not implemented yet');
  }
}
