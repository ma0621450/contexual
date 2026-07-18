export function getSafeInternalReturnPath(
  value: string | null | undefined,
): string | null {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return null;
  }

  return value;
}

export function getInviteReturnPath(token: string): string {
  const params = new URLSearchParams({ invite: token, accept: '1' });
  return `/onboarding?${params.toString()}`;
}

export function getInviteAuthHref(
  route: '/login' | '/signup',
  email: string,
  returnPath: string,
): string {
  const params = new URLSearchParams({ from: returnPath });
  if (email) params.set('email', email);
  return `${route}?${params.toString()}`;
}
