import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requirePlatformAdmin } from '@/lib/api/server';
import { ChangePasswordClient } from './ChangePasswordClient';

export const metadata: Metadata = { title: 'Change password' };

export default async function ChangePasswordPage() {
  const admin = await requirePlatformAdmin();

  if (!admin.mustChangePassword) {
    redirect('/organizations');
  }

  return <ChangePasswordClient email={admin.email} />;
}
