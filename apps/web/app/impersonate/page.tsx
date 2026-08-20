import type { Metadata } from 'next';
import { ImpersonateRedeem } from './ImpersonateRedeem';

export const metadata: Metadata = {
  title: 'Support session',
  robots: { index: false, follow: false },
};

export default async function ImpersonatePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <ImpersonateRedeem token={token ?? null} />;
}
