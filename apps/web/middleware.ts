import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth/constants';
import { verifyAccessToken } from '@/lib/auth/jwt';

const PUBLIC_ROUTES = ['/login', '/signup', '/forgot-password'];
const AUTH_FLOW_ROUTES = ['/verify-email', '/onboarding'];
const PROTECTED_ROUTES = ['/dashboard'];

function matchesRoute(pathname: string, routes: string[]) {
  return routes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export async function middleware(request: NextRequest) {
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

  if (isAuthenticated && matchesRoute(pathname, PUBLIC_ROUTES)) {
    const redirectTo = !payload.emailVerified
      ? '/verify-email'
      : !payload.hasMembership
        ? '/onboarding'
        : '/dashboard';
    return NextResponse.redirect(new URL(redirectTo, request.url));
  }

  if (!isAuthenticated && matchesRoute(pathname, PROTECTED_ROUTES)) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (!isAuthenticated && matchesRoute(pathname, AUTH_FLOW_ROUTES)) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (isAuthenticated && payload) {
    if (!payload.emailVerified && pathname !== '/verify-email') {
      if (
        matchesRoute(pathname, PROTECTED_ROUTES) ||
        matchesRoute(pathname, AUTH_FLOW_ROUTES)
      ) {
        return NextResponse.redirect(new URL('/verify-email', request.url));
      }
    }

    if (
      payload.emailVerified &&
      !payload.hasMembership &&
      matchesRoute(pathname, PROTECTED_ROUTES)
    ) {
      return NextResponse.redirect(new URL('/onboarding', request.url));
    }

    if (payload.emailVerified && payload.hasMembership && pathname === '/onboarding') {
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
