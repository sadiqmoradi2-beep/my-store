'use client';

import { ArrowRight, Loader2, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

/** Standard "go back to the parent list/page" link for detail/sub-tab pages */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
    >
      <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
      {label}
    </Link>
  );
}

type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger' | 'accent';

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-primary-700 text-white hover:bg-primary-800 dark:bg-primary-600 dark:hover:bg-primary-500',
  accent: 'bg-accent-500 text-white hover:bg-accent-600',
  outline: 'border border-line bg-surface-2 text-ink hover:border-primary-400 hover:text-primary-700 dark:hover:text-primary-300',
  ghost: 'text-ink-muted hover:bg-surface-3 hover:text-ink',
  danger: 'bg-red-700 text-white hover:bg-red-800',
};

export function Button({
  variant = 'primary',
  loading = false,
  className,
  children,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  loading?: boolean;
}) {
  return (
    <button
      className={cn(
        'inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors duration-200',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500',
        'disabled:cursor-not-allowed disabled:opacity-50',
        buttonVariants[variant],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-ink-faint">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600 dark:text-red-400">{error}</span>}
    </label>
  );
}

export const inputClass =
  'w-full min-h-10 rounded-lg border border-line bg-surface-2 px-3 text-sm text-ink placeholder:text-ink-faint transition-colors duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20';

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputClass, props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        inputClass,
        'cursor-pointer [color-scheme:light] [&>option]:bg-surface-2 [&>option]:text-ink dark:[color-scheme:dark]',
        props.className,
      )}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputClass, 'min-h-20 py-2', props.className)} />;
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('rounded-xl border border-line bg-surface-2 shadow-sm', className)}>
      {children}
    </div>
  );
}

const badgeTones: Record<string, string> = {
  PENDING: 'bg-accent-100 text-accent-700 dark:bg-accent-700/20 dark:text-accent-300',
  APPROVED: 'bg-primary-100 text-primary-800 dark:bg-primary-800/40 dark:text-primary-200',
  READY: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  SHIPPING: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  DELIVERED: 'bg-primary-600 text-white dark:bg-primary-500',
  CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  RETURNED: 'bg-stone-200 text-stone-700 dark:bg-stone-700/40 dark:text-stone-300',
  neutral: 'bg-surface-3 text-ink-muted',
  danger: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

export function Badge({ tone = 'neutral', children }: { tone?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        badgeTones[tone] ?? badgeTones.neutral,
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center py-16', className)}>
      <Loader2 className="h-7 w-7 animate-spin text-primary-600" aria-label="loading" />
    </div>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        aria-label="close"
        className="absolute inset-0 cursor-pointer bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal
        className="relative w-full max-w-md rounded-2xl border border-line bg-surface-2 p-6 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-base font-bold text-ink">{title}</h2>
          <button
            onClick={onClose}
            aria-label="close dialog"
            className="cursor-pointer rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-surface-3 hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  return (
    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
      {message}
    </p>
  );
}
