import { randomBytes } from 'crypto';

export function slugifyOrganizationName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export async function generateUniqueOrganizationSlug(
  name: string,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  const base = slugifyOrganizationName(name) || 'organization';
  if (!(await isTaken(base))) {
    return base;
  }

  const suffix = randomBytes(3).toString('hex');
  return `${base}-${suffix}`;
}
