"use client";
/**
 * Spark UI primitives. Mobile-first, big tap targets (48px+), visible focus,
 * labels wired to inputs, and errors announced to screen readers.
 */
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { LAST_TAB_KEY, resolveBack } from "@/lib/ui/last-tab";

import { cx } from "@/lib/ui/cx";
export { cx };

type Variant = "primary" | "secondary" | "ghost" | "danger";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:opacity-90 shadow-sm",
  secondary: "bg-surface text-ink border border-line hover:bg-surface-2",
  ghost: "bg-transparent text-accent-text hover:bg-accent-soft",
  danger: "bg-surface text-danger border border-line hover:bg-surface-2",
};
const base =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-base font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

export function Button({
  variant = "primary",
  loading = false,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button type={type} className={cx(base, VARIANTS[variant], className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner small /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({ href, variant = "primary", className, children }: { href: string; variant?: Variant; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={cx(base, VARIANTS[variant], className)}>
      {children}
    </Link>
  );
}

export function Card({ children, className, as: Tag = "section", ...rest }: { children: ReactNode; className?: string; as?: "section" | "div" | "article" | "li" } & Record<string, unknown>) {
  return (
    <Tag className={cx("rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(43,27,46,0.06)]", className)} {...rest}>
      {children}
    </Tag>
  );
}

export function PageHeader({ title, subtitle, back: defaultBack, action }: { title: string; subtitle?: ReactNode; back?: { href: string; label: string }; action?: ReactNode }) {
  const [back, setBack] = useState(defaultBack);
  useEffect(() => {
    if (!defaultBack) return setBack(undefined);
    let last: string | null = null;
    try {
      last = sessionStorage.getItem(LAST_TAB_KEY);
    } catch {
      last = null;
    }
    setBack(resolveBack(defaultBack, last));
  }, [defaultBack?.href, defaultBack?.label]);
  return (
    <header className="mb-5 fade-up">
      {back ? (
        <Link href={back.href} className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent-text">
          <span aria-hidden>‹</span> {back.label}
        </Link>
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold leading-tight text-ink">{title}</h1>
          {subtitle ? <p className="mt-1 text-base text-muted">{subtitle}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </header>
  );
}

export function SectionTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="mb-3 mt-6 text-xl font-bold text-ink">
      {children}
    </h2>
  );
}

function FieldShell({ id, label, hint, error, children, optional }: { id: string; label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; optional?: boolean }) {
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1 block text-sm font-semibold text-ink">
        {label} {optional ? <span className="font-normal text-muted">(optional)</span> : null}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="mb-1.5 text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const inputClass =
  "block w-full min-h-12 rounded-2xl border border-line bg-surface px-4 py-3 text-ink placeholder:text-muted/80 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40";

function describedBy(id: string, hint?: unknown, error?: unknown) {
  return [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
}

export function TextField({
  label, hint, error, optional, value, onChange, type = "text", ...rest
}: {
  label: ReactNode; hint?: ReactNode; error?: string | null; optional?: boolean; value: string; onChange: (value: string) => void;
  type?: string; placeholder?: string; autoComplete?: string; maxLength?: number; required?: boolean; inputMode?: "text" | "email" | "numeric" | "url"; name?: string; autoFocus?: boolean; min?: string; max?: string; pattern?: string;
}) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional}>
      <input id={id} type={type} className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...rest} />
    </FieldShell>
  );
}

export function TextAreaField({
  label, hint, error, optional, value, onChange, rows = 4, ...rest
}: { label: ReactNode; hint?: ReactNode; error?: string | null; optional?: boolean; value: string; onChange: (value: string) => void; rows?: number; placeholder?: string; maxLength?: number; required?: boolean; name?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional}>
      <textarea id={id} rows={rows} className={cx(inputClass, "resize-y leading-relaxed")} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...rest} />
      {rest.maxLength ? (
        <p className="mt-1 text-right text-xs text-muted" aria-live="polite">
          {value.length}/{rest.maxLength}
        </p>
      ) : null}
    </FieldShell>
  );
}

export function SelectField<T extends string>({
  label, hint, error, optional, value, onChange, options,
}: { label: ReactNode; hint?: ReactNode; error?: string | null; optional?: boolean; value: T; onChange: (value: T) => void; options: Array<{ value: T; label: string }> }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional}>
      <select id={id} className={inputClass} value={value} onChange={(e) => onChange(e.target.value as T)} aria-describedby={describedBy(id, hint, error)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export interface Choice<T extends string> {
  value: T;
  label: ReactNode;
  description?: ReactNode;
}

/** Radio (single) or checkbox (multiple) group rendered as tappable cards. */
export function ChoiceGroup<T extends string>({
  legend, hint, options, value, onChange, multiple = false, columns = 1, name,
}: {
  legend: ReactNode; hint?: ReactNode; options: Choice<T>[]; value: T | T[] | null; onChange: (value: any) => void; multiple?: boolean; columns?: 1 | 2; name?: string;
}) {
  const autoName = useId();
  const groupName = name ?? autoName;
  const selected = new Set(Array.isArray(value) ? value : value ? [value] : []);
  return (
    <fieldset className="mb-4">
      <legend className="mb-1 text-base font-semibold text-ink">{legend}</legend>
      {hint ? <p className="mb-2 text-sm text-muted">{hint}</p> : null}
      <div className={cx("grid gap-2", columns === 2 && "sm:grid-cols-2")}>
        {options.map((option) => {
          const checked = selected.has(option.value);
          return (
            <label
              key={option.value}
              className={cx(
                "flex min-h-12 cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition",
                checked ? "border-accent bg-accent-soft" : "border-line bg-surface hover:bg-surface-2",
              )}
            >
              <input
                type={multiple ? "checkbox" : "radio"}
                name={groupName}
                className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent)]"
                checked={checked}
                onChange={() => {
                  if (multiple) {
                    const next = new Set(selected);
                    if (next.has(option.value)) next.delete(option.value);
                    else next.add(option.value);
                    onChange([...next]);
                  } else {
                    onChange(option.value);
                  }
                }}
              />
              <span className="min-w-0">
                <span className="block font-medium text-ink">{option.label}</span>
                {option.description ? <span className="mt-0.5 block text-sm text-muted">{option.description}</span> : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Accessible 1 to 5 scale (a radio group). */
export function ScaleInput({ legend, hint, value, onChange, minLabel, maxLabel, name }: { legend: ReactNode; hint?: ReactNode; value: number | null; onChange: (value: number) => void; minLabel: string; maxLabel: string; name?: string }) {
  const autoName = useId();
  return (
    <fieldset className="mb-4">
      <legend className="mb-1 text-base font-semibold text-ink">{legend}</legend>
      {hint ? <p className="mb-2 text-sm text-muted">{hint}</p> : null}
      <div className="flex gap-2" role="presentation">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="flex-1">
            <input type="radio" className="peer sr-only" name={name ?? autoName} value={n} checked={value === n} onChange={() => onChange(n)} aria-label={`${n} of 5${n === 1 ? `, ${minLabel}` : n === 5 ? `, ${maxLabel}` : ""}`} />
            <span className="flex min-h-12 cursor-pointer items-center justify-center rounded-2xl border border-line bg-surface text-lg font-bold text-ink transition peer-checked:border-accent peer-checked:bg-accent peer-checked:text-accent-ink peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent)]">
              {n}
            </span>
          </label>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted" aria-hidden>
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </fieldset>
  );
}

export function Notice({ tone = "info", title, children, className }: { tone?: "info" | "success" | "warning" | "danger"; title?: ReactNode; children?: ReactNode; className?: string }) {
  const tones = {
    info: "border-line bg-surface-2",
    success: "border-line bg-accent-soft",
    warning: "border-line bg-surface-2",
    danger: "border-danger bg-surface",
  };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cx("rounded-2xl border px-4 py-3 text-sm text-ink", tones[tone], className)}>
      {title ? <p className={cx("font-semibold", tone === "danger" && "text-danger")}>{title}</p> : null}
      {children ? <div className={cx(title ? "mt-1" : null, "text-ink")}>{children}</div> : null}
    </div>
  );
}

export function EmptyState({ emoji, title, body, action }: { emoji: string; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-line px-6 py-10 text-center">
      <p className="text-4xl" aria-hidden>
        {emoji}
      </p>
      <p className="mt-3 text-lg font-bold text-ink">{title}</p>
      {body ? <p className="mx-auto mt-1 max-w-sm text-muted">{body}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Spinner({ small = false, label }: { small?: boolean; label?: string }) {
  return (
    <span className="inline-flex items-center gap-2" role={label ? "status" : undefined}>
      <span aria-hidden className={cx("inline-block animate-spin rounded-full border-2 border-current border-r-transparent", small ? "h-4 w-4" : "h-6 w-6")} />
      {label ? <span className="text-muted">{label}</span> : null}
    </span>
  );
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center text-accent-text">
      <Spinner label={label} />
    </div>
  );
}

export function Avatar({ name, size = "md" }: { name: string | null | undefined; size?: "sm" | "md" | "lg" }) {
  const initial = (name ?? "?").trim().charAt(0).toUpperCase() || "?";
  const sizes = { sm: "h-8 w-8 text-sm", md: "h-10 w-10 text-base", lg: "h-14 w-14 text-xl" };
  return (
    <span aria-hidden className={cx("inline-flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-bold text-accent-text", sizes[size])}>
      {initial}
    </span>
  );
}

export function Badge({ children, tone = "accent" }: { children: ReactNode; tone?: "accent" | "muted" }) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", tone === "accent" ? "bg-accent-soft text-accent-text" : "bg-surface-2 text-muted")}>
      {children}
    </span>
  );
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-valuetext={`${value} of ${max}`}>
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toasts (polite live region)
// ---------------------------------------------------------------------------
interface ToastApi {
  show(message: string, tone?: "success" | "error"): void;
}
const ToastContext = createContext<ToastApi>({ show: () => undefined });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; tone: "success" | "error" }>>([]);
  const counter = useRef(0);
  const show = useCallback((message: string, tone: "success" | "error" = "success") => {
    const id = ++counter.current;
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  const api = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div key={t.id} className={cx("pop pointer-events-auto max-w-md rounded-full px-5 py-3 text-sm font-semibold shadow-lg", t.tone === "error" ? "bg-danger text-white" : "bg-ink text-bg")}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
