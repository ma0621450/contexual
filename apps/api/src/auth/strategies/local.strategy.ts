import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { Strategy } from 'passport-local';
import { clientIp } from '../../config/trust-proxy';
import { AuthService } from '../auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    super({ usernameField: 'email', passReqToCallback: true });
  }

  async validate(req: Request, email: string, password: string) {
    const user = await this.authService.validateUser(
      email,
      password,
      clientIp(req),
    );
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return user;
  }
}
