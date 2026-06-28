'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { verifyEmailSchema } from '@/lib/validations/auth';
import { DEV_OTP_HINT } from '@/lib/auth/dev-hint';
import { apiFetch } from '@/lib/api/client';
import { AuthLayout } from '@/components/auth/AuthLayout';

export default function VerifyEmailPage() {
  const router = useRouter();
  const [digits, setDigits] = useState(['', '', '', '']);
  const [error, setError] = useState('');
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

  return (
    <AuthLayout
      title="Verify your email"
      subtitle="We sent a verification code to your email address"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <p className="text-sm text-text-muted">{DEV_OTP_HINT}</p>

        {error ? (
          <p className="rounded-lg border border-semantic-error/20 bg-semantic-error/5 px-3 py-2 text-sm text-semantic-error">
            {error}
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
              className={`h-12 w-12 rounded-lg border bg-surface-card text-center text-lg font-semibold outline-none transition-colors ${
                error
                  ? 'border-semantic-error focus:border-semantic-error focus:ring-2 focus:ring-semantic-error/20'
                  : 'border-border focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20'
              }`}
              aria-label={`Digit ${index + 1}`}
            />
          ))}
        </div>

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Verifying...' : 'Verify email'}
        </button>
      </form>
    </AuthLayout>
  );
}
