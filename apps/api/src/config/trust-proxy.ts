import type { INestApplication } from '@nestjs/common';
import type { Request } from 'express';

export const DEFAULT_TRUST_PROXY_HOPS = 1;
export const MAX_TRUST_PROXY_HOPS = 5;

/**
 * Number of proxies in front of the API whose X-Forwarded-For entries are
 * trusted. Express then uses the entry that many hops from the right, so
 * values a client prepends to the header are ignored.
 *
 * The browser reaches the API through the Next.js rewrite, which forwards the
 * header unchanged and only fills it in when absent. Count the edge proxies
 * (load balancer, CDN) that append the client address in front of the web app.
 */
export function resolveTrustProxyHops(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.TRUST_PROXY_HOPS?.trim();
  if (!raw) return DEFAULT_TRUST_PROXY_HOPS;
  const hops = Number(raw);
  if (!Number.isInteger(hops) || hops < 0 || hops > MAX_TRUST_PROXY_HOPS) {
    throw new Error(
      `TRUST_PROXY_HOPS must be an integer between 0 and ${MAX_TRUST_PROXY_HOPS}`,
    );
  }
  return hops;
}

export function applyTrustProxy(
  app: INestApplication,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const instance = app.getHttpAdapter().getInstance() as {
    set: (setting: string, value: unknown) => void;
  };
  instance.set('trust proxy', resolveTrustProxyHops(env));
}

export function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
