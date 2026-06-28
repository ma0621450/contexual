import type { InputHTMLAttributes } from 'react';

type FormFieldProps = {
  label: string;
  error?: string;
} & InputHTMLAttributes<HTMLInputElement>;

export function FormField({ label, error, id, className = '', ...props }: FormFieldProps) {
  const fieldId = id ?? props.name;

  return (
    <div>
      <label
        htmlFor={fieldId}
        className="mb-1.5 block text-sm font-medium text-text-primary"
      >
        {label}
      </label>
      <input
        id={fieldId}
        className={`auth-input ${error ? 'auth-input-error' : ''} ${className}`}
        {...props}
      />
      {error ? (
        <p className="mt-1.5 text-sm text-semantic-error">{error}</p>
      ) : null}
    </div>
  );
}
