import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { ImpersonationBanner } from '@/components/dashboard/ImpersonationBanner';
import { SuspendedAccess } from '@/components/dashboard/SuspendedAccess';
import { getCurrentUser, getOrganizations } from '@/lib/api/server';

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  if (!user.emailVerifiedAt) {
    redirect('/verify-email');
  }

  if (!user.activeOrganizationId || user.memberships.length === 0) {
    redirect('/onboarding');
  }

  const organizations = await getOrganizations();
  const activeMembership = user.memberships.find(
    (membership) =>
      membership.organizationId === user.activeOrganizationId &&
      !membership.suspended,
  );

  if (!activeMembership || !user.role) {
    return (
      <SuspendedAccess
        organizations={organizations}
        activeOrganizationId={user.activeOrganizationId}
      />
    );
  }

  return (
    <>
      {user.isImpersonated ? <ImpersonationBanner /> : null}
      <DashboardShell
        isAdmin={user.role === 'ADMIN'}
        user={{ name: user.name, email: user.email, role: user.role }}
        organizations={organizations}
        activeOrganizationId={user.activeOrganizationId}
      >
        {children}
      </DashboardShell>
    </>
  );
}
