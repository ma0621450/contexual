import { Suspense } from 'react';
import OnboardingPage from './OnboardingClient';
import { getCurrentUser } from '@/lib/api/server';

export default async function OnboardingRoutePage() {
  const currentUser = await getCurrentUser();

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-base text-[16px] text-sub">
          Loading…
        </div>
      }
    >
      <OnboardingPage currentUser={currentUser} />
    </Suspense>
  );
}
