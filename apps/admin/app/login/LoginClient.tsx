'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardContent, Input, Label } from '@contexual/ui';
import { ShieldCheckIcon } from 'lucide-react';
import { ApiError, apiPost } from '@/lib/api/client';

type LoginResponse =
  | {
      requiresTotpEnrollment: true;
      enrollment: { secret: string; otpauthUrl: string };
    }
  | {
      requiresTotpEnrollment: false;
      admin: { mustChangePassword: boolean };
    };

type Stage = 'credentials' | 'totp' | 'enroll';

export function LoginClient() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [enrollment, setEnrollment] = useState<{
    secret: string;
    otpauthUrl: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function finish(result: LoginResponse) {
    if (result.requiresTotpEnrollment) return;
    router.replace(
      result.admin.mustChangePassword ? '/change-password' : '/organizations',
    );
    router.refresh();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      if (stage === 'enroll') {
        const confirmed = await apiPost<LoginResponse>(
          '/platform/auth/totp/confirm',
          { email, password, totp },
        );
        finish(confirmed);
        return;
      }

      const result = await apiPost<LoginResponse>('/platform/auth/login', {
        email,
        password,
        ...(stage === 'totp' ? { totp } : {}),
      });

      if (result.requiresTotpEnrollment) {
        setEnrollment(result.enrollment);
        setStage('enroll');
        return;
      }

      finish(result);
    } catch (caught) {
      if (stage === 'credentials' && caught instanceof ApiError) {
        // Credentials are checked together with the code, so an initial
        // rejection may simply mean the code has not been supplied yet.
        setStage('totp');
        setError('Enter the six-digit code from your authenticator app.');
        return;
      }
      setError(
        caught instanceof ApiError ? caught.message : 'Unable to sign in',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheckIcon className="size-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              Platform Admin
            </h1>
            <p className="text-sm text-muted-foreground">
              Internal access only. All activity is recorded.
            </p>
          </div>
        </div>

        <Card>
          <CardContent>
            <form onSubmit={submit} className="flex flex-col gap-4">
              {stage === 'enroll' && enrollment ? (
                <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4">
                  <p className="text-sm font-medium">Set up two-factor auth</p>
                  <p className="text-sm text-muted-foreground">
                    Add this secret to your authenticator app, then enter the
                    code it generates.
                  </p>
                  <code className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm tracking-wider break-all">
                    {enrollment.secret}
                  </code>
                </div>
              ) : null}

              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Platform email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={pending || stage === 'enroll'}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={pending || stage === 'enroll'}
                />
              </div>

              {stage !== 'credentials' ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="totp">Authentication code</Label>
                  <Input
                    id="totp"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    maxLength={6}
                    required
                    value={totp}
                    onChange={(event) =>
                      setTotp(event.target.value.replace(/\D/g, ''))
                    }
                    disabled={pending}
                    className="font-mono tracking-[0.4em]"
                  />
                </div>
              ) : null}

              {error ? (
                <p
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {error}
                </p>
              ) : null}

              <Button type="submit" disabled={pending}>
                {pending
                  ? 'Verifying…'
                  : stage === 'enroll'
                    ? 'Confirm and sign in'
                    : 'Sign in'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
