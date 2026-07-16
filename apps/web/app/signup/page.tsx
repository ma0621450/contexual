'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { registerSchema } from '@/lib/validations/auth';
import { apiFetch } from '@/lib/api/client';
import { AuthError, AuthLayout, AuthLink } from '@/components/auth/AuthLayout';
import { FormField } from '@/components/auth/FormField';
import { Button } from '@/components/ui/button';

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError('');
    setFieldErrors({});

    const parsed = registerSchema.safeParse({ name, email, password });
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
    const result = await apiFetch<{ redirectTo?: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(parsed.data),
    });
    setLoading(false);

    if (!result.ok) {
      setFormError(result.error);
      return;
    }

    router.push(result.data.redirectTo ?? '/verify-email');
    router.refresh();
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Get started with Contexual — set up your workspace next"
      footer={
        <p>
          Already have an account? <AuthLink href="/login">Sign in</AuthLink>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <AuthError>{formError}</AuthError>

        <FormField
          label="Name"
          name="name"
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={fieldErrors.name}
        />

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
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={fieldErrors.password}
        />

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </AuthLayout>
  );
}
