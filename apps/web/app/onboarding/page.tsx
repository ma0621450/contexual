import { Suspense } from 'react';
import OnboardingPage from './OnboardingClient';

export default function OnboardingRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-surface-page text-sm text-text-muted">
          Loading...
        </div>
      }
    >
      <OnboardingPage />
    </Suspense>
  );
}
