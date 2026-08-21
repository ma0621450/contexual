const DEFAULT_JWT_SECRETS = new Set([
  'dev-jwt-secret-change-in-production',
  'change-me',
  'secret',
]);

export function validateRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV !== 'production') return;

  const errors: string[] = [];
  const required = (name: string): string => {
    const value = env[name]?.trim();
    if (!value) errors.push(`${name} is required`);
    return value ?? '';
  };

  const databaseUrl = required('DATABASE_URL');
  const jwtSecret = required('JWT_SECRET');
  const encryptionKey = required('ENCRYPTION_KEY');
  const webUrl = required('WEB_URL');
  const resendApiKey = required('RESEND_API_KEY');
  required('EMAIL_FROM');
  const s3Bucket = required('S3_BUCKET');
  required('S3_REGION');
  const clamAvHost = required('CLAMAV_HOST');

  if (databaseUrl && !/^postgres(ql)?:\/\//i.test(databaseUrl)) {
    errors.push('DATABASE_URL must be a PostgreSQL URL');
  }
  if (
    jwtSecret &&
    (jwtSecret.length < 32 ||
      DEFAULT_JWT_SECRETS.has(jwtSecret.toLowerCase()) ||
      /change|replace|example|default/i.test(jwtSecret))
  ) {
    errors.push('JWT_SECRET must be a strong, non-default secret');
  }
  if (
    encryptionKey &&
    (!/^[a-f0-9]{64}$/i.test(encryptionKey) || /^(.)\1+$/.test(encryptionKey))
  ) {
    errors.push('ENCRYPTION_KEY must be a non-default 32-byte hex key');
  }
  validateUrl('WEB_URL', webUrl, errors, true);
  if (env.PLATFORM_SEED_PASSWORD) {
    const seedPassword = env.PLATFORM_SEED_PASSWORD;
    if (
      seedPassword.length < 16 ||
      /password|admin|change|default|contexual|123456/i.test(seedPassword)
    ) {
      errors.push(
        'PLATFORM_SEED_PASSWORD must be a strong, non-guessable value',
      );
    }
  }
  if (env.ADMIN_URL) {
    validateUrl('ADMIN_URL', env.ADMIN_URL, errors, true);
    if (env.ADMIN_URL.trim() === webUrl.trim()) {
      errors.push('ADMIN_URL must not share an origin with WEB_URL');
    }
  }

  if (resendApiKey && !resendApiKey.startsWith('re_')) {
    errors.push('RESEND_API_KEY must be a Resend API key');
  }
  if (env.FILE_SCANNING_REQUIRED !== 'true') {
    errors.push('FILE_SCANNING_REQUIRED must be true');
  }
  if (
    clamAvHost &&
    ['127.0.0.1', 'localhost', '::1'].includes(clamAvHost.toLowerCase())
  ) {
    errors.push('CLAMAV_HOST must reference the production ClamAV service');
  }
  validatePort('CLAMAV_PORT', env.CLAMAV_PORT, errors);
  validatePositiveInteger('CLAMAV_TIMEOUT_MS', env.CLAMAV_TIMEOUT_MS, errors);

  if (s3Bucket && /^(test|example|change|replace)/i.test(s3Bucket)) {
    errors.push('S3_BUCKET must identify durable production storage');
  }
  if (env.S3_ENDPOINT) {
    validateUrl('S3_ENDPOINT', env.S3_ENDPOINT, errors, false);
    try {
      const hostname = new URL(env.S3_ENDPOINT).hostname.toLowerCase();
      if (['localhost', '127.0.0.1', '::1', 'minio'].includes(hostname)) {
        errors.push('S3_ENDPOINT must not reference local storage');
      }
    } catch {
      // The URL validator reports the actionable error.
    }
  }
  const hasAccessKey = Boolean(env.S3_ACCESS_KEY_ID?.trim());
  const hasSecretKey = Boolean(env.S3_SECRET_ACCESS_KEY?.trim());
  if (hasAccessKey !== hasSecretKey) {
    errors.push(
      'S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be set together',
    );
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid production configuration:\n- ${[...new Set(errors)].join('\n- ')}`,
    );
  }
}

function validateUrl(
  name: string,
  value: string,
  errors: string[],
  requireHttps: boolean,
) {
  if (!value) return;
  try {
    const url = new URL(value);
    if (
      (requireHttps && url.protocol !== 'https:') ||
      (!requireHttps && !['http:', 'https:'].includes(url.protocol))
    ) {
      errors.push(`${name} must use ${requireHttps ? 'HTTPS' : 'HTTP(S)'}`);
    }
  } catch {
    errors.push(`${name} must be a valid URL`);
  }
}

function validatePort(
  name: string,
  value: string | undefined,
  errors: string[],
) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    errors.push(`${name} must be a valid TCP port`);
  }
}

function validatePositiveInteger(
  name: string,
  value: string | undefined,
  errors: string[],
) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    errors.push(`${name} must be a positive integer`);
  }
}
