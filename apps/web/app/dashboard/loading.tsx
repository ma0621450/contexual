import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardLoading() {
  return (
    <div
      className="mx-auto max-w-6xl space-y-4 px-4 py-8 sm:px-6"
      aria-label="Loading workspace"
      aria-busy="true"
    >
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-80 max-w-full" />
      <Skeleton className="mt-6 h-64 w-full rounded-xl" />
    </div>
  );
}
