'use client';

import Link from 'next/link';
import {
  forwardRef,
  useId,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { cn } from '@/lib/utils';

/** Emoji keep their own colours inside gradient-clipped headings. */
export function Emoji({ children }: { children: string }) {
  return (
    <span className="[-webkit-text-fill-color:initial] [color:initial]" role="img" aria-hidden>
      {children}
    </span>
  );
}

export function AuthHeading({
  title,
  subtitle,
  align = 'left',
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  align?: 'left' | 'center';
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-[10px] leading-[normal]',
        align === 'center' ? 'items-center text-center' : 'items-start',
      )}
    >
      <h1 className="text-gradient-title text-[39px] font-normal tracking-[-1.56px] sm:whitespace-nowrap">
        {title}
      </h1>
      {subtitle ? <p className="text-[16px] text-sub">{subtitle}</p> : null}
    </div>
  );
}

function ErrorCircle() {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/icon-error-circle.svg" alt="" aria-hidden width={21} height={21} />;
}

type FieldShellProps = {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
};

function FieldShell({ label, htmlFor, error, hint, children }: FieldShellProps) {
  return (
    <div className="flex w-full flex-col gap-[9px]">
      <div className="flex items-center justify-between">
        <label htmlFor={htmlFor} className="text-[18px] leading-[normal] text-white">
          {label}
        </label>
        {error ? <ErrorCircle /> : null}
      </div>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-[14px] text-danger-soft">
          {error}
        </p>
      ) : hint ? (
        <div className="text-[14px] text-sub">{hint}</div>
      ) : null}
    </div>
  );
}

const boxClass =
  'flex h-[50px] w-full items-center gap-[10px] rounded-[6px] border px-[25px] transition-colors';

function boxState(error?: string) {
  return error
    ? 'border-danger-soft'
    : 'border-line focus-within:border-dim hover:border-line-strong';
}

type AuthInputProps = {
  label: string;
  error?: string;
  hint?: ReactNode;
  trailing?: ReactNode;
} & InputHTMLAttributes<HTMLInputElement>;

export const AuthInput = forwardRef<HTMLInputElement, AuthInputProps>(
  function AuthInput({ label, error, hint, trailing, id, className, ...props }, ref) {
    const generatedId = useId();
    const fieldId = id ?? props.name ?? generatedId;

    return (
      <FieldShell label={label} htmlFor={fieldId} error={error} hint={hint}>
        <div className={cn(boxClass, boxState(error))}>
          <input
            ref={ref}
            id={fieldId}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${fieldId}-error` : undefined}
            className={cn(
              'h-full min-w-0 flex-1 bg-transparent text-[16px] leading-[normal] text-white outline-none placeholder:text-sub read-only:text-soft',
              className,
            )}
            {...props}
          />
          {trailing}
        </div>
      </FieldShell>
    );
  },
);

export function PasswordInput(props: Omit<AuthInputProps, 'type' | 'trailing'>) {
  const [visible, setVisible] = useState(false);

  return (
    <AuthInput
      {...props}
      type={visible ? 'text' : 'password'}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="shrink-0 rounded-sm opacity-90 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={visible ? '/brand/icon-show.svg' : '/brand/icon-hide.svg'}
            alt=""
            width={24}
            height={24}
          />
        </button>
      }
    />
  );
}

export type AuthSelectOption<T extends string> = { value: T; label: string };

export function AuthSelect<T extends string>({
  label,
  name,
  value,
  onValueChange,
  options,
  placeholder,
  error,
  showChevron = true,
  disabled,
}: {
  label: string;
  name: string;
  value: T | '';
  onValueChange: (value: T) => void;
  options: AuthSelectOption<T>[];
  placeholder: string;
  error?: string;
  showChevron?: boolean;
  disabled?: boolean;
}) {
  return (
    <FieldShell label={label} htmlFor={name} error={error}>
      <SelectPrimitive.Root
        name={name}
        value={value || undefined}
        onValueChange={(next) => onValueChange(next as T)}
        disabled={disabled}
      >
        <SelectPrimitive.Trigger
          id={name}
          aria-invalid={error ? true : undefined}
          className={cn(
            boxClass,
            boxState(error),
            'text-left text-[16px] leading-[normal] text-white outline-none focus-visible:border-dim data-[placeholder]:text-sub',
          )}
        >
          <span className="min-w-0 flex-1 truncate">
            <SelectPrimitive.Value placeholder={placeholder} />
          </span>
          {showChevron ? (
            <SelectPrimitive.Icon asChild>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/icon-chevron-down.svg" alt="" width={24} height={24} />
            </SelectPrimitive.Icon>
          ) : null}
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={4}
            className="z-50 w-[var(--radix-select-trigger-width)] rounded-[7px] border border-line bg-raised px-[13px] py-[8px] text-white shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)] data-[state=open]:animate-in data-[state=open]:fade-in-0"
          >
            <SelectPrimitive.Viewport>
              {options.map((option, index) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={option.value}
                  className={cn(
                    'flex cursor-pointer items-center px-[10px] py-[15px] text-[16px] leading-[normal] text-dim outline-none transition-[padding,color,background-color] select-none',
                    'data-[highlighted]:rounded-[9px] data-[highlighted]:bg-line data-[highlighted]:px-[22px] data-[highlighted]:text-white',
                    'data-[state=checked]:text-soft',
                    index < options.length - 1 ? 'border-b border-line' : null,
                  )}
                >
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </FieldShell>
  );
}

const buttonClass =
  'inline-flex w-full items-center justify-center rounded-[4px] border border-line-strong bg-line px-6 py-[12px] text-[18px] leading-[normal] text-white transition-colors hover:bg-[#2e2e2e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 disabled:cursor-not-allowed disabled:opacity-60';

export function AuthButton({
  className,
  type = 'submit',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={cn(buttonClass, className)} {...props} />;
}

export function AuthButtonLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={cn(buttonClass, className)}>
      {children}
    </Link>
  );
}

export function AuthTextLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn('text-white underline-offset-4 transition-colors hover:underline', className)}
    >
      {children}
    </Link>
  );
}

export function AuthTextButton({
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cn(
        'text-white underline-offset-4 transition-colors hover:underline disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}

export function AuthFooter({
  children,
  align = 'left',
}: {
  children: ReactNode;
  align?: 'left' | 'center';
}) {
  return (
    <p className={cn('text-[16px] leading-[normal] text-sub', align === 'center' && 'text-center')}>
      {children}
    </p>
  );
}

export function AuthNotice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'error';
  children: ReactNode;
}) {
  if (!children) return null;
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-[6px] border px-[16px] py-[12px] text-[14px] leading-[1.45]',
        tone === 'error'
          ? 'border-danger-soft/40 bg-danger-soft/5 text-danger-soft'
          : 'border-line bg-raised text-soft',
      )}
    >
      {children}
    </p>
  );
}
