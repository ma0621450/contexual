'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { verifyEmailSchema } from '@/lib/validations/auth';
import { DEV_OTP_HINT } from '@/lib/auth/dev-hint';
import { apiFetch } from '@/lib/api/client';
import { AuthError, AuthLayout } from '@/components/auth/AuthLayout';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function VerifyEmailPage() {
  const router = useRouter();
  const [digits, setDigits] = useState(['', '', '', '']);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  function updateDigit(index: number, value: string) {
    const next = value.replace(/\D/g, '').slice(-1);
    const updated = [...digits];
    updated[index] = next;
    setDigits(updated);

    if (next && index < 3) {
      inputsRef.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(
    index: number,
    event: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (!pasted) return;

    const updated = pasted.split('').concat(Array(4).fill('')).slice(0, 4);
    setDigits(updated);
    inputsRef.current[Math.min(pasted.length, 3)]?.focus();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');

    const otp = digits.join('');
    const parsed = verifyEmailSchema.safeParse({ otp });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid code');
      return;
    }

    setLoading(true);
    const result = await apiFetch<{ redirectTo?: string }>('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify(parsed.data),
    });
    setLoading(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    router.push(result.data.redirectTo ?? '/onboarding');
    router.refresh();
  }

  async function resendCode() {
    if (loading) return;
    setLoading(true);
    setError('');
    setNotice('');
    const result = await apiFetch<{ ok: true }>('/auth/resend-verification', {
      method: 'POST',
    });
    setLoading(false);
    if (result.ok) {
      setNotice('A new verification code was sent.');
    } else {
      setError(result.error);
    }
  }

  return (
    <AuthLayout
      title="Verify your email"
      subtitle="We sent a verification code to your email address"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {DEV_OTP_HINT ? (
          <p className="text-center text-sm text-muted-foreground">
            {DEV_OTP_HINT}
          </p>
        ) : null}

        <AuthError>{error}</AuthError>
        {notice ? (
          <p className="rounded-lg border border-border bg-accent px-3 py-2 text-sm text-accent-foreground">
            {notice}
          </p>
        ) : null}

        <div className="flex justify-center gap-3">
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(element) => {
                inputsRef.current[index] = element;
              }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(event) => updateDigit(index, event.target.value)}
              onKeyDown={(event) => handleKeyDown(index, event)}
              onPaste={handlePaste}
              className={cn(
                'size-12 rounded-lg border bg-transparent text-center text-lg font-semibold outline-none transition-colors focus:ring-2',
                error
                  ? 'border-destructive focus:border-destructive focus:ring-destructive/20'
                  : 'border-input focus:border-ring focus:ring-ring/25',
              )}
              aria-label={`Digit ${index + 1}`}
            />
          ))}
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Verifying…' : 'Verify email'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={resendCode}
          disabled={loading}
        >
          Resend code
        </Button>
      </form>
    </AuthLayout>
  );
}
