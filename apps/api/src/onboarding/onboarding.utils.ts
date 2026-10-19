import { randomBytes } from 'crypto';

export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 48;
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Slugs that would collide with app routes, infrastructure hosts, or the brand. */
export const RESERVED_SLUGS = new Set([
  'about',
  'account',
  'accounts',
  'admin',
  'administrator',
  'api',
  'app',
  'apps',
  'assets',
  'auth',
  'billing',
  'blog',
  'cdn',
  'chat',
  'dashboard',
  'dev',
  'docs',
  'email',
  'files',
  'forgot-password',
  'help',
  'invite',
  'invites',
  'login',
  'logout',
  'mail',
  'memories',
  'new',
  'onboarding',
  'platform',
  'pricing',
  'promplex',
  'promplexai',
  'providers',
  'reset-password',
  'root',
  'security',
  'settings',
  'signin',
  'signup',
  'static',
  'staging',
  'status',
  'support',
  'system',
  'team',
  'usage',
  'verify-email',
  'w',
  'workspace',
  'workspaces',
  'www',
]);

export type SlugProblem = 'invalid' | 'reserved';

export function slugifyOrganizationName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, '');
}

export function getSlugProblem(slug: string): SlugProblem | null {
  if (
    slug.length < SLUG_MIN_LENGTH ||
    slug.length > SLUG_MAX_LENGTH ||
    !SLUG_PATTERN.test(slug)
  ) {
    return 'invalid';
  }
  if (RESERVED_SLUGS.has(slug)) {
    return 'reserved';
  }
  return null;
}

export const SLUG_PROBLEM_MESSAGES: Record<SlugProblem | 'taken', string> = {
  invalid: `Use ${SLUG_MIN_LENGTH}–${SLUG_MAX_LENGTH} lowercase letters, numbers, or single hyphens`,
  reserved: 'This workspace URL is reserved. Choose another one',
  taken: 'This workspace URL is already taken',
};

export async function generateUniqueOrganizationSlug(
  name: string,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  let base = slugifyOrganizationName(name);
  if (getSlugProblem(base) === 'invalid') {
    base = base ? `${base}-workspace`.slice(0, SLUG_MAX_LENGTH) : 'workspace';
  }

  if (getSlugProblem(base) === null && !(await isTaken(base))) {
    return base;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const suffix = randomBytes(3).toString('hex');
    const candidate = `${base.slice(0, SLUG_MAX_LENGTH - suffix.length - 1)}-${suffix}`;
    if (!(await isTaken(candidate))) {
      return candidate;
    }
  }

  return `workspace-${randomBytes(6).toString('hex')}`;
}
