import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from '@/lib/auth/constants';
import { verifyAccessToken } from '@/lib/auth/jwt';
import {
  getInviteReturnPath,
  getSafeInternalReturnPath,
} from '@/lib/auth/return-path';

const INTERNAL_API_URL =
  process.env.INTERNAL_API_URL ?? 'http://localhost:3001';
const PUBLIC_ROUTES = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
];
const AUTH_FLOW_ROUTES = ['/verify-email', '/onboarding'];
const PROTECTED_ROUTES = ['/dashboard'];
const API_TIMEOUT_MS = Number(process.env.API_PROXY_TIMEOUT_MS ?? 3000);

type RefreshResult = 'refreshed' | 'rejected' | 'unavailable' | 'not-attempted';

function matchesRoute(pathname: string, routes: string[]) {
  return routes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function copySetCookieHeaders(source: Response, target: NextResponse) {
  const headers = source.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const setCookies = headers.getSetCookie?.() ?? [];

  if (setCookies.length > 0) {
    for (const cookie of setCookies) {
      target.headers.append('set-cookie', cookie);
    }
    return;
  }

  const setCookie = source.headers.get('set-cookie');
  if (setCookie) {
    target.headers.append('set-cookie', setCookie);
  }
}

async function refreshAndRetry(
  request: NextRequest,
): Promise<{ result: RefreshResult; response?: NextResponse }> {
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
  if (!refreshToken) {
    return { result: 'not-attempted' };
  }

  try {
    const response = await fetch(`${INTERNAL_API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { cookie: request.headers.get('cookie') ?? '' },
      cache: 'no-store',
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });

    if (response.status === 401 || response.status === 403) {
      return { result: 'rejected' };
    }
    if (!response.ok) {
      return { result: 'unavailable' };
    }

    const retryResponse = NextResponse.redirect(request.nextUrl);
    copySetCookieHeaders(response, retryResponse);
    return { result: 'refreshed', response: retryResponse };
  } catch {
    return { result: 'unavailable' };
  }
}

function redirectToLogin(request: NextRequest, clearCookies: boolean) {
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set(
    'from',
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  const response = NextResponse.redirect(loginUrl);
  if (clearCookies) {
    response.cookies.delete(ACCESS_TOKEN_COOKIE);
    response.cookies.delete(REFRESH_TOKEN_COOKIE);
  }
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const inviteToken =
    pathname === '/onboarding'
      ? request.nextUrl.searchParams.get('invite')
      : null;
  const inviteReturnPath = inviteToken
    ? getInviteReturnPath(inviteToken)
    : null;

  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const payload = accessToken ? await verifyAccessToken(accessToken) : null;
  const isAuthenticated = payload !== null;
  let refreshResult: RefreshResult = 'not-attempted';

  if (!isAuthenticated && request.cookies.has(REFRESH_TOKEN_COOKIE)) {
    const refresh = await refreshAndRetry(request);
    refreshResult = refresh.result;
    if (refresh.response) {
      return refresh.response;
    }
  }

  if (isAuthenticated && matchesRoute(pathname, PUBLIC_ROUTES)) {
    const redirectTo = !payload.emailVerified
      ? '/verify-email'
      : !payload.hasMembership
        ? '/onboarding'
        : '/dashboard';
    return NextResponse.redirect(new URL(redirectTo, request.url));
  }

  if (!isAuthenticated && matchesRoute(pathname, PROTECTED_ROUTES)) {
    return redirectToLogin(request, refreshResult === 'rejected');
  }

  if (
    !isAuthenticated &&
    matchesRoute(pathname, AUTH_FLOW_ROUTES) &&
    !inviteReturnPath
  ) {
    return redirectToLogin(request, refreshResult === 'rejected');
  }

  if (isAuthenticated && payload) {
    if (
      !payload.emailVerified &&
      pathname !== '/verify-email' &&
      (matchesRoute(pathname, PROTECTED_ROUTES) ||
        matchesRoute(pathname, AUTH_FLOW_ROUTES))
    ) {
      const verifyUrl = new URL('/verify-email', request.url);
      if (inviteReturnPath) {
        verifyUrl.searchParams.set('from', inviteReturnPath);
      }
      return NextResponse.redirect(verifyUrl);
    }

    if (
      payload.emailVerified &&
      !payload.hasMembership &&
      matchesRoute(pathname, PROTECTED_ROUTES)
    ) {
      return NextResponse.redirect(new URL('/onboarding', request.url));
    }

    if (
      payload.emailVerified &&
      payload.hasMembership &&
      pathname === '/onboarding' &&
      !request.nextUrl.searchParams.has('invite') &&
      request.nextUrl.searchParams.get('action') !== 'create'
    ) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    if (payload.emailVerified && pathname === '/verify-email') {
      const redirectTo =
        getSafeInternalReturnPath(request.nextUrl.searchParams.get('from')) ??
        (payload.hasMembership ? '/dashboard' : '/onboarding');
      return NextResponse.redirect(new URL(redirectTo, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
