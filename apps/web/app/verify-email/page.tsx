'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { verifyEmailSchema } from '@/lib/validations/auth';
import { DEV_OTP_HINT } from '@/lib/auth/dev-hint';
import { apiFetch } from '@/lib/api/client';
import { AuthCenteredLayout } from '@/components/auth/AuthShell';
import {
  AuthButton,
  AuthFooter,
  AuthHeading,
  AuthNotice,
  AuthTextButton,
  Emoji,
} from '@/components/auth/AuthControls';
import { OtpInput } from '@/components/auth/OtpInput';
import { getSafeInternalReturnPath } from '@/lib/auth/return-path';

const RESEND_COOLDOWN_SECONDS = 60;
const EMPTY_CODE = ['', '', '', ''];

function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnPath = getSafeInternalReturnPath(searchParams.get('from'));
  const [digits, setDigits] = useState(EMPTY_CODE);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [resendError, setResendError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    void apiFetch<{ email: string }>('/auth/me').then((result) => {
      if (result.ok) setEmail(result.data.email);
    });
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;
    setError('');
    setResendError('');
    setNotice('');

    const parsed = verifyEmailSchema.safeParse({ otp: digits.join('') });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid code');
      return;
    }

    setLoading(true);
    const result = await apiFetch<{ redirectTo?: string }>('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify(parsed.data),
    });

    if (!result.ok) {
      setLoading(false);
      setError(result.error);
      setDigits(EMPTY_CODE);
      return;
    }

    router.push(returnPath ?? result.data.redirectTo ?? '/onboarding');
    router.refresh();
  }

  async function resendCode() {
    if (resending || cooldown > 0) return;
    setResending(true);
    setError('');
    setResendError('');
    setNotice('');
    const result = await apiFetch<{ ok: true }>('/auth/resend-verification', {
      method: 'POST',
    });
    setResending(false);
    if (result.ok) {
      setNotice('A new code is on its way to your inbox.');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } else if (result.status === 400 && /wait/i.test(result.error)) {
      setNotice('We just sent you a code. You can request another one shortly.');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } else {
      setResendError(result.error);
    }
  }

  return (
    <AuthCenteredLayout>
      <div className="flex flex-col items-center gap-[68px]">
        <AuthHeading
          align="center"
          title={
            <>
              We Sent You a Code <Emoji>✋</Emoji>
            </>
          }
          subtitle={
            <>
              we sent you a code on{' '}
              <span className="break-all text-soft sm:break-normal sm:whitespace-nowrap">
                {email || 'your email'}
              </span>
            </>
          }
        />

        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex w-full flex-col items-center gap-[37px]"
        >
          <OtpInput
            value={digits}
            onChange={(next) => {
              setDigits(next);
              setError('');
            }}
            invalid={Boolean(error)}
            disabled={loading}
          />
          {error || resendError || notice ? (
            <div className="-my-[16px] w-full">
              <AuthNotice tone={error || resendError ? 'error' : 'info'}>
                {error || resendError || notice}
              </AuthNotice>
            </div>
          ) : null}
          <AuthButton disabled={loading} className="w-[251px]">
            {loading ? 'Verifying…' : 'Login'}
          </AuthButton>
          <AuthFooter align="center">
            Didn&apos;t receive the Code yet ?{' '}
            <AuthTextButton onClick={resendCode} disabled={resending || cooldown > 0}>
              {cooldown > 0 ? `Resend Code in ${cooldown}s` : 'Resend Code'}
            </AuthTextButton>
          </AuthFooter>
          {process.env.NODE_ENV !== 'production' ? (
            <p className="-mt-[16px] max-w-[438px] text-center text-[13px] text-sub">
              {DEV_OTP_HINT}
            </p>
          ) : null}
        </form>
      </div>
    </AuthCenteredLayout>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailForm />
    </Suspense>
  );
}
