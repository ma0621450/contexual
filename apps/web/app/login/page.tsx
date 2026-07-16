'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { loginSchema } from '@/lib/validations/auth';
import { apiFetch } from '@/lib/api/client';
import { AuthError, AuthLayout, AuthLink } from '@/components/auth/AuthLayout';
import { FormField } from '@/components/auth/FormField';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  function getSafeReturnPath(): string | null {
    const from = new URLSearchParams(window.location.search).get('from');
    return from?.startsWith('/') && !from.startsWith('//') ? from : null;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError('');
    setFieldErrors({});

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === 'string') {
          errors[key] = issue.message;
        }
      }
      setFieldErrors(errors);
      return;
    }

    setLoading(true);
    const result = await apiFetch<{ redirectTo?: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(parsed.data),
    });
    setLoading(false);

    if (!result.ok) {
      setFormError(result.error);
      return;
    }

    router.push(getSafeReturnPath() ?? result.data.redirectTo ?? '/dashboard');
    router.refresh();
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your Contexual workspace"
      footer={
        <p>
          Don&apos;t have an account? <AuthLink href="/signup">Sign up</AuthLink>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <AuthError>{formError}</AuthError>

        <FormField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={fieldErrors.email}
        />

        <FormField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={fieldErrors.password}
          labelAction={
            <AuthLink href="/forgot-password">Forgot password?</AuthLink>
          }
        />

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthLayout>
  );
}
