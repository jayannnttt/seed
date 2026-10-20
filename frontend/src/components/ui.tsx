/* SeedSathi UI primitives — shared across every page.
 *
 * Styling rules: subtle 1px borders, restrained shadows, rounded cards,
 * warm ivory surfaces, deep forest green primary, golden accent reserved
 * for warnings and important actions.
 */
import {
  AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle,
  type LucideIcon,
} from "lucide-react";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { makeToast, type Toast, type ToastKind } from "../lib/hooks";

/* ---------------------------------------------------------------- card --- */
export function Card({
  children, className = "", as: As = "div", ...rest
}: React.HTMLAttributes<HTMLDivElement> & { as?: React.ElementType }) {
  return (
    <As
      className={`rounded-xl border border-earth-200 bg-white shadow-[0_1px_2px_rgba(36,31,24,0.04)] ${className}`}
      {...rest}
    >
      {children}
    </As>
  );
}

export function CardHeader({
  title, subtitle, action, icon: Icon,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-earth-100 px-5 py-4">
      <div className="flex items-start gap-3">
        {Icon && (
          <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-forest-50 text-forest-700">
            <Icon size={17} />
          </span>
        )}
        <div>
          <h2 className="text-[15px] font-semibold text-earth-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[13px] text-earth-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

/* -------------------------------------------------------------- badge ---- */
type Tone = "neutral" | "green" | "gold" | "red" | "info" | "sage";

const TONES: Record<Tone, string> = {
  neutral: "bg-earth-100 text-earth-700 border-earth-200",
  green: "bg-forest-50 text-forest-700 border-forest-200",
  sage: "bg-sage-100 text-sage-600 border-sage-200",
  gold: "bg-gold-100 text-gold-600 border-gold-200",
  red: "bg-clay-100 text-clay-600 border-clay-200",
  info: "bg-info-100 text-info-700 border-info-100",
};

export function Badge({
  children, tone = "neutral", icon: Icon, className = "",
}: {
  children: React.ReactNode;
  tone?: Tone;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONES[tone]} ${className}`}
    >
      {Icon && <Icon size={11} />}
      {children}
    </span>
  );
}

/** Severity / status / risk mappings used in several places. */
export function severityTone(severity: string): Tone {
  return severity === "critical" ? "red" : severity === "warning" ? "gold" : "info";
}
export function alertStatusTone(status: string): Tone {
  return status === "open" ? "gold" : status === "acknowledged" ? "info" : "green";
}
export function riskTone(flag: string): Tone {
  return flag === "priority" ? "red" : flag === "watch" ? "gold" : "sage";
}
export function conditionTone(condition: string): Tone {
  return condition === "good" ? "green"
    : condition === "fair" ? "gold"
    : condition === "poor" ? "red" : "neutral";
}
export function rescueStatusTone(status: string): Tone {
  return status === "received" ? "green"
    : status === "rejected" ? "red"
    : status === "dispatched" ? "info"
    : status === "approved" ? "sage" : "gold";
}

/* -------------------------------------------------------------- button --- */
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "accent";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-forest-700 text-white border border-forest-700 hover:bg-forest-800 disabled:bg-earth-300 disabled:border-earth-300",
  secondary:
    "bg-white text-earth-700 border border-earth-200 hover:bg-earth-100 disabled:text-earth-400",
  ghost: "bg-transparent text-earth-600 border border-transparent hover:bg-earth-100",
  danger: "bg-clay-600 text-white border border-clay-600 hover:bg-clay-500 disabled:bg-earth-300",
  accent:
    "bg-gold-400 text-earth-900 border border-gold-400 hover:bg-gold-500 hover:border-gold-500",
};

export function Button({
  children, variant = "secondary", size = "md", icon: Icon, loading, className = "", ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  icon?: LucideIcon;
  loading?: boolean;
}) {
  const sizeClass = size === "sm" ? "h-8 px-2.5 text-[12.5px] gap-1.5" : "h-9 px-3.5 text-[13px] gap-2";
  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${sizeClass} ${className}`}
      disabled={rest.disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 size={15} className="animate-spin" /> : Icon ? <Icon size={15} /> : null}
      {children}
    </button>
  );
}

/* --------------------------------------------------------------- input --- */
const fieldClass =
  "w-full rounded-lg border border-earth-200 bg-white px-3 py-2 text-[13px] text-earth-900 placeholder:text-earth-400 focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-100 disabled:bg-earth-100";

export function Field({
  label, children, hint, error, required,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  error?: string | null;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] font-medium text-earth-700">
        {label}
        {required && <span className="ml-0.5 text-clay-500">*</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-1 block text-[11.5px] text-earth-500">{hint}</span>}
      {error && <span className="mt-1 block text-[11.5px] text-clay-600">{error}</span>}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${fieldClass} ${props.className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${fieldClass} ${props.className ?? ""}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${fieldClass} ${props.className ?? ""}`} />;
}

/* --------------------------------------------------------------- modal --- */
export function Modal({
  open, onClose, title, subtitle, children, footer, width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-earth-900/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div
        className="animate-fade-in my-auto flex w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        style={{ maxWidth: width === "max-w-lg" ? 560 : undefined }}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-4 border-b border-earth-100 px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-earth-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[12.5px] text-earth-500">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-earth-400 transition-colors hover:bg-earth-100 hover:text-earth-700"
            aria-label="Close dialog"
          >
            <X size={17} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-earth-100 px-5 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/** Confirmation dialog for destructive or irreversible actions. */
export function ConfirmDialog({
  open, onClose, onConfirm, title, message, confirmLabel = "Confirm",
  cancelLabel = "Cancel", tone = "danger", loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  loading?: boolean;
}) {
  const Icon = tone === "danger" ? AlertTriangle : CheckCircle2;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose} disabled={loading}>{cancelLabel}</Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <span
          className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            tone === "danger" ? "bg-clay-100 text-clay-600" : "bg-forest-50 text-forest-700"
          }`}
        >
          <Icon size={18} />
        </span>
        <div className="text-[13.5px] leading-relaxed text-earth-700">{message}</div>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------- empty/loading - */
export function EmptyState({
  icon: Icon, title, description, action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-sage-100 text-sage-500">
        <Icon size={20} />
      </span>
      <h3 className="text-[14px] font-semibold text-earth-800">{title}</h3>
      {description && (
        <p className="mt-1 max-w-md text-[12.5px] leading-relaxed text-earth-500">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 px-6 py-14 text-[13px] text-earth-500">
      <Loader2 size={16} className="animate-spin text-forest-600" />
      {label}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-clay-100 text-clay-600">
        <XCircle size={19} />
      </span>
      <div>
        <h3 className="text-[14px] font-semibold text-earth-800">Could not load this view</h3>
        <p className="mt-1 max-w-md text-[12.5px] text-earth-500">{message}</p>
      </div>
      {onRetry && <Button onClick={onRetry}>Try again</Button>}
    </div>
  );
}

/** Consistent data-table wrapper that scrolls horizontally on small screens. */
export function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
        {children}
      </table>
    </div>
  );
}

export function Th({
  children, className = "", align = "left",
}: { children?: React.ReactNode; className?: string; align?: "left" | "right" | "center" }) {
  return (
    <th
      className={`whitespace-nowrap border-b border-earth-200 px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wide text-earth-500 text-${align} ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children, className = "", align = "left",
}: { children?: React.ReactNode; className?: string; align?: "left" | "right" | "center" }) {
  return (
    <td className={`border-b border-earth-100 px-4 py-3 align-middle text-${align} ${className}`}>
      {children}
    </td>
  );
}

/* ------------------------------------------------------------- toasts ---- */
interface ToastApi {
  push: (kind: ToastKind, title: string, description?: string) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, title: string, description?: string) => {
      const toast = makeToast(kind, title, description);
      setToasts((prev) => [...prev.slice(-3), toast]);
      window.setTimeout(() => dismiss(toast.id), kind === "error" ? 7000 : 4500);
    },
    [dismiss],
  );

  const apiValue = useMemo<ToastApi>(
    () => ({
      push,
      success: (t, d) => push("success", t, d),
      error: (t, d) => push("error", t, d),
      info: (t, d) => push("info", t, d),
    }),
    [push],
  );

  const icons: Record<ToastKind, { icon: LucideIcon; cls: string }> = {
    success: { icon: CheckCircle2, cls: "text-forest-600 bg-forest-50" },
    error: { icon: XCircle, cls: "text-clay-600 bg-clay-100" },
    info: { icon: Info, cls: "text-info-500 bg-info-100" },
  };

  return (
    <ToastContext.Provider value={apiValue}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2">
        {toasts.map((toast) => {
          const { icon: Icon, cls } = icons[toast.kind];
          return (
            <div
              key={toast.id}
              className="animate-fade-in pointer-events-auto flex items-start gap-3 rounded-xl border border-earth-200 bg-white px-4 py-3 shadow-lg"
            >
              <span className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${cls}`}>
                <Icon size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-earth-900">{toast.title}</p>
                {toast.description && (
                  <p className="mt-0.5 break-words text-[12px] leading-relaxed text-earth-500">
                    {toast.description}
                  </p>
                )}
              </div>
              <button
                onClick={() => dismiss(toast.id)}
                className="rounded p-1 text-earth-400 hover:bg-earth-100 hover:text-earth-700"
                aria-label="Dismiss notification"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

/* ------------------------------------------------------------- notice ---- */
/** Inline informational banner (used for demo/simulation honesty labels). */
export function Notice({
  children, tone = "info", icon: Icon, className = "",
}: {
  children: React.ReactNode;
  tone?: "info" | "gold" | "green";
  icon?: LucideIcon;
  className?: string;
}) {
  const tones = {
    info: "border-info-100 bg-info-100/60 text-info-700",
    gold: "border-gold-200 bg-gold-100/70 text-gold-600",
    green: "border-forest-200 bg-forest-50 text-forest-700",
  };
  return (
    <div className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-[12.5px] leading-relaxed ${tones[tone]} ${className}`}>
      {Icon && <Icon size={15} className="mt-0.5 shrink-0" />}
      <div>{children}</div>
    </div>
  );
}

/** Page heading with optional actions — keeps every page visually consistent. */
export function PageHeader({
  title, description, actions, badge,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2.5">
          <h1 className="font-display text-[26px] leading-tight font-semibold text-forest-900">
            {title}
          </h1>
          {badge}
        </div>
        {description && (
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-earth-500">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
