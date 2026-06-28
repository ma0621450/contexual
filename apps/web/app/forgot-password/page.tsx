'use client';

import { useState } from 'react';
import { forgotPasswordSchema } from '@/lib/validations/auth';
import { apiFetch } from '@/lib/api/client';
import { AuthLayout, AuthLink } from '@/components/auth/AuthLayout';
import { FormField } from '@/components/auth/FormField';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage('');
    setFieldErrors({});

    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldErrors({ email: parsed.error.issues[0]?.message ?? 'Invalid email' });
      return;
    }

    setLoading(true);
    const result = await apiFetch<{ message?: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(parsed.data),
    });
    setLoading(false);

    if (!result.ok) {
      setMessage(result.error);
      return;
    }

    setMessage(
      result.data.message ??
        'If an account exists for this email, a reset link will be sent.',
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll send you a link to reset your password"
      footer={
        <p>
          Remember your password? <AuthLink href="/login">Sign in</AuthLink>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {message ? (
          <p className="rounded-lg border border-brand-primary/20 bg-brand-tint px-3 py-2 text-sm text-text-primary">
            {message}
          </p>
        ) : null}

        <FormField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={fieldErrors.email}
        />

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Sending...' : 'Send reset link'}
        </button>
      </form>
    </AuthLayout>
  );
}
