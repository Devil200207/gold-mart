import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'inline-flex select-none items-center justify-center gap-2 rounded-xl font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-amber-500 text-stone-950 shadow-sm hover:bg-amber-400 active:bg-amber-600',
  secondary: 'bg-white text-stone-800 ring-1 ring-inset ring-stone-300 hover:bg-stone-50 active:bg-stone-100',
  ghost: 'text-stone-700 hover:bg-stone-100 active:bg-stone-200',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-500 active:bg-red-700',
  dark: 'bg-stone-900 text-white shadow-sm hover:bg-stone-800 active:bg-stone-950',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-5 text-base',
};

export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', fullWidth = false, extra = '') {
  return `${base} ${variants[variant]} ${sizes[size]} ${fullWidth ? 'w-full' : ''} ${extra}`.trim();
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  children: ReactNode;
}

/** A button that is automatically disabled (and shows a spinner) while `loading`. */
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses(variant, size, fullWidth, className)}
      {...rest}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

interface LinkButtonProps extends LinkProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

export function LinkButton({ variant = 'primary', size = 'md', fullWidth = false, className = '', ...rest }: LinkButtonProps) {
  return <Link className={buttonClasses(variant, size, fullWidth, className as string)} {...rest} />;
}

interface AnchorButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

export function AnchorButton({ variant = 'primary', size = 'md', fullWidth = false, className = '', ...rest }: AnchorButtonProps) {
  return <a className={buttonClasses(variant, size, fullWidth, className)} {...rest} />;
}
