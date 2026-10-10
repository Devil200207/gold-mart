import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

const control =
  'block w-full rounded-xl border-0 bg-white px-3.5 py-2.5 text-stone-900 shadow-sm ring-1 ring-inset ring-stone-300 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-amber-500 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500';

const invalid = 'ring-red-400 focus:ring-red-500';

interface FieldShellProps {
  id: string;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}

function FieldShell({ id, label, hint, error, children, className = '' }: FieldShellProps) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-stone-700">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs font-medium text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-stone-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Text or element shown inside the input on the right (e.g. "g" or "AED"). */
  suffix?: ReactNode;
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, suffix, id, className = '', containerClassName, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <FieldShell id={inputId} label={label} hint={hint} error={error} className={containerClassName}>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          className={`${control} ${error ? invalid : ''} ${suffix ? 'pr-14' : ''} ${className}`}
          {...rest}
        />
        {suffix && (
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-sm font-medium text-stone-500">
            {suffix}
          </div>
        )}
      </div>
    </FieldShell>
  );
});

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  containerClassName?: string;
}

export function Select({ label, hint, error, id, className = '', containerClassName, children, ...rest }: SelectProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <FieldShell id={selectId} label={label} hint={hint} error={error} className={containerClassName}>
      <select id={selectId} className={`${control} pr-8 ${error ? invalid : ''} ${className}`} {...rest}>
        {children}
      </select>
    </FieldShell>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  containerClassName?: string;
}

export function Textarea({ label, hint, error, id, className = '', containerClassName, ...rest }: TextareaProps) {
  const autoId = useId();
  const textareaId = id ?? autoId;
  return (
    <FieldShell id={textareaId} label={label} hint={hint} error={error} className={containerClassName}>
      <textarea id={textareaId} className={`${control} min-h-[88px] ${error ? invalid : ''} ${className}`} {...rest} />
    </FieldShell>
  );
}
