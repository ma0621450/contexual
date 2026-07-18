import { redirect } from 'next/navigation';
import { getCurrentUser, getFiles } from '@/lib/api/server';
import { FilesClient } from './FilesClient';

export default async function FilesPage() {
  const user = await getCurrentUser();

  if (!user) redirect('/login');
  if (!user.emailVerifiedAt) redirect('/verify-email');
  if (!user.activeOrganizationId || user.memberships.length === 0) {
    redirect('/onboarding');
  }

  const files = await getFiles();

  return (
    <FilesClient
      initialFiles={files}
      currentUserId={user.id}
      isAdmin={user.role === 'ADMIN'}
    />
  );
}
