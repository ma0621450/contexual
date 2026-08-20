import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type {
  OrganizationDetail,
  OrganizationListResponse,
  PlatformAdmin,
} from './types';

const INTERNAL_API_URL =
  process.env.INTERNAL_API_URL ?? 'http://localhost:3001';
const API_TIMEOUT_MS = Number(process.env.API_SERVER_TIMEOUT_MS ?? 5000);

class PlatformApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function platformFetch<T>(path: string): Promise<T> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');

  let response: Response;
  try {
    response = await fetch(`${INTERNAL_API_URL}/api${path}`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch {
    throw new PlatformApiError(503, 'The platform API is unavailable');
  }

  if (!response.ok) {
    throw new PlatformApiError(
      response.status,
      `Request failed with status ${response.status}`,
    );
  }

  return (await response.json()) as T;
}

/** Redirects to the sign-in page when the platform session is missing. */
export async function requirePlatformAdmin(): Promise<PlatformAdmin> {
  try {
    return await platformFetch<PlatformAdmin>('/platform/auth/me');
  } catch (error) {
    if (error instanceof PlatformApiError && error.status === 401) {
      redirect('/login');
    }
    throw error;
  }
}

export async function getPlatformAdmin(): Promise<PlatformAdmin | null> {
  try {
    return await platformFetch<PlatformAdmin>('/platform/auth/me');
  } catch {
    return null;
  }
}

export async function listOrganizations(params: {
  search?: string;
  planTier?: string;
  page?: number;
}): Promise<OrganizationListResponse> {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.planTier) query.set('planTier', params.planTier);
  if (params.page && params.page > 1) query.set('page', String(params.page));

  const suffix = query.toString();
  return platformFetch<OrganizationListResponse>(
    `/platform/organizations${suffix ? `?${suffix}` : ''}`,
  );
}

export async function getOrganization(id: string): Promise<OrganizationDetail> {
  return platformFetch<OrganizationDetail>(
    `/platform/organizations/${encodeURIComponent(id)}`,
  );
}

export { PlatformApiError };
