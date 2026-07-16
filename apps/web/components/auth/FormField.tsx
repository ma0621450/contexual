import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type FormFieldProps = {
  label: string;
  error?: string;
  labelAction?: ReactNode;
} & InputHTMLAttributes<HTMLInputElement>;

export function FormField({
  label,
  error,
  labelAction,
  id,
  className,
  ...props
}: FormFieldProps) {
  const fieldId = id ?? props.name;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={fieldId}>{label}</Label>
        {labelAction}
      </div>
      <Input
        id={fieldId}
        aria-invalid={error ? true : undefined}
        className={cn(className)}
        {...props}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
