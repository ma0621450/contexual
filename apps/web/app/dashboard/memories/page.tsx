import { redirect } from 'next/navigation';
import { getCurrentUser, getMemories } from '@/lib/api/server';
import { MemoriesClient } from './MemoriesClient';

export default async function MemoriesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!user.activeOrganizationId) redirect('/onboarding');

  const memories = await getMemories();
  return <MemoriesClient initialMemories={memories} isAdmin={user.role === 'ADMIN'} />;
}
