import { validateRuntimeConfig } from './runtime-config';

const validProductionEnv: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://user:password@db:5432/contexual',
  JWT_SECRET: 'a-strong-random-secret-with-at-least-32-characters',
  ENCRYPTION_KEY:
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  WEB_URL: 'https://app.example.com',
  RESEND_API_KEY: 're_example',
  EMAIL_FROM: 'PromplexAI <mail@example.com>',
  S3_BUCKET: 'contexual-production',
  S3_REGION: 'us-east-1',
  FILE_SCANNING_REQUIRED: 'true',
  CLAMAV_HOST: 'clamav',
  CLAMAV_PORT: '3310',
  CLAMAV_TIMEOUT_MS: '30000',
  TRUST_PROXY_HOPS: '1',
};

describe('validateRuntimeConfig', () => {
  it('does not impose production requirements in test or development', () => {
    expect(() => validateRuntimeConfig({ NODE_ENV: 'test' })).not.toThrow();
  });

  it('accepts a complete production configuration', () => {
    expect(() => validateRuntimeConfig(validProductionEnv)).not.toThrow();
  });

  it('rejects unsafe production defaults', () => {
    let message = '';
    try {
      validateRuntimeConfig({
        ...validProductionEnv,
        JWT_SECRET: 'dev-jwt-secret-change-in-production',
        FILE_SCANNING_REQUIRED: 'false',
        CLAMAV_HOST: 'localhost',
        S3_BUCKET: '',
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain('JWT_SECRET');
    expect(message).toContain('S3_BUCKET');
    expect(message).toContain('FILE_SCANNING_REQUIRED');
  });

  it.each([undefined, '0', '6', 'all', '1.5'])(
    'requires an explicit edge proxy count in production (%s)',
    (value) => {
      expect(() =>
        validateRuntimeConfig({
          ...validProductionEnv,
          TRUST_PROXY_HOPS: value,
        }),
      ).toThrow('TRUST_PROXY_HOPS');
    },
  );
});
