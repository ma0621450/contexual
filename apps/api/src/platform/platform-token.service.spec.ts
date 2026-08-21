import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  PlatformTokenService,
  derivePlatformSecret,
} from './platform-token.service';
import {
  PLATFORM_TOKEN_TYPE,
  type PlatformTokenPayload,
} from './platform.types';

const JWT_SECRET = 'a-sufficiently-long-development-secret-value';

function build() {
  const jwtService = new JwtService({ secret: JWT_SECRET });
  const config = {
    getOrThrow: () => JWT_SECRET,
  } as unknown as ConfigService;

  return { jwtService, service: new PlatformTokenService(jwtService, config) };
}

describe('PlatformTokenService', () => {
  it('derives a platform secret distinct from the application secret', () => {
    const derived = derivePlatformSecret(JWT_SECRET);

    expect(derived).not.toBe(JWT_SECRET);
    expect(derived).toHaveLength(64);
    expect(derivePlatformSecret(JWT_SECRET)).toBe(derived);
    expect(derivePlatformSecret(`${JWT_SECRET}x`)).not.toBe(derived);
  });

  it('signs tokens the application secret cannot verify', () => {
    const { jwtService, service } = build();

    const token = service.sign({
      sub: 'admin-1',
      email: 'staff@example.com',
      role: 'OWNER',
    });

    expect(() =>
      jwtService.verify<PlatformTokenPayload>(token, { secret: JWT_SECRET }),
    ).toThrow();
    expect(
      jwtService.verify<PlatformTokenPayload>(token, {
        secret: service.getSecret(),
      }),
    ).toMatchObject({
      sub: 'admin-1',
      typ: PLATFORM_TOKEN_TYPE,
      role: 'OWNER',
    });
  });

  it('rejects application tokens on the platform secret', () => {
    const { jwtService, service } = build();

    const appToken = jwtService.sign(
      { sub: 'user-1', email: 'member@example.com' },
      { secret: JWT_SECRET },
    );

    expect(() =>
      jwtService.verify<PlatformTokenPayload>(appToken, {
        secret: service.getSecret(),
      }),
    ).toThrow();
  });
});
