import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from '@/lib/auth/constants';
import { verifyAccessToken } from '@/lib/auth/jwt';

const INTERNAL_API_URL =
  process.env.INTERNAL_API_URL ?? 'http://localhost:3001';
const PUBLIC_ROUTES = ['/login', '/signup', '/forgot-password', '/reset-password'];
const AUTH_FLOW_ROUTES = ['/verify-email', '/onboarding'];
const PROTECTED_ROUTES = ['/dashboard'];

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

async function refreshAndRetry(request: NextRequest): Promise<NextResponse | null> {
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
  if (!refreshToken) {
    return null;
  }

  try {
    const response = await fetch(`${INTERNAL_API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { cookie: request.headers.get('cookie') ?? '' },
      cache: 'no-store',
    });

    if (!response.ok) {
      return null;
    }

    const retryResponse = NextResponse.redirect(request.nextUrl);
    copySetCookieHeaders(response, retryResponse);
    return retryResponse;
  } catch {
    return null;
  }
}

function redirectToLogin(request: NextRequest) {
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set(
    'from',
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  const response = NextResponse.redirect(loginUrl);
  response.cookies.delete(ACCESS_TOKEN_COOKIE);
  response.cookies.delete(REFRESH_TOKEN_COOKIE);
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

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

  if (!isAuthenticated && request.cookies.has(REFRESH_TOKEN_COOKIE)) {
    const retryResponse = await refreshAndRetry(request);
    if (retryResponse) {
      return retryResponse;
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
    return redirectToLogin(request);
  }

  if (!isAuthenticated && matchesRoute(pathname, AUTH_FLOW_ROUTES)) {
    return redirectToLogin(request);
  }

  if (isAuthenticated && payload) {
    if (
      !payload.emailVerified &&
      pathname !== '/verify-email' &&
      (matchesRoute(pathname, PROTECTED_ROUTES) ||
        matchesRoute(pathname, AUTH_FLOW_ROUTES))
    ) {
      return NextResponse.redirect(new URL('/verify-email', request.url));
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
      const redirectTo = payload.hasMembership ? '/dashboard' : '/onboarding';
      return NextResponse.redirect(new URL(redirectTo, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
