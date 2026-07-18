import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/api/server';
import { SettingsClient } from './SettingsClient';

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!user.emailVerifiedAt) redirect('/verify-email');

  return <SettingsClient name={user.name} email={user.email} />;
}
