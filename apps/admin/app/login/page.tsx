import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getPlatformAdmin } from '@/lib/api/server';
import { LoginClient } from './LoginClient';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage() {
  const admin = await getPlatformAdmin();
  if (admin) {
    redirect(admin.mustChangePassword ? '/change-password' : '/organizations');
  }

  return <LoginClient />;
}
