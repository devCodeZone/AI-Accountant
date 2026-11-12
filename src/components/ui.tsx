import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function Card({ className, ...p }: ComponentProps<"div">) {
  return <div className={cx("rounded-2xl border border-line bg-white", className)} {...p} />;
}

type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
const btn: Record<BtnVariant, string> = {
  primary: "bg-brand text-white hover:opacity-90",
  secondary: "border border-line bg-white text-ink hover:bg-stone-50",
  ghost: "text-ink hover:bg-stone-100",
  danger: "bg-bad text-white hover:opacity-90",
};
export function Button({ variant = "primary", className, size = "md", ...p }: ComponentProps<"button"> & { variant?: BtnVariant; size?: "sm" | "md" | "lg" }) {
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition disabled:opacity-50 disabled:pointer-events-none",
        size === "sm" ? "h-8 px-3 text-sm" : size === "lg" ? "h-12 px-5 text-base" : "h-10 px-4 text-sm",
        btn[variant], className,
      )}
      {...p}
    />
  );
}
export function LinkButton({ variant = "secondary", className, size = "md", ...p }: ComponentProps<typeof Link> & { variant?: BtnVariant; size?: "sm" | "md" }) {
  return (
    <Link
      className={cx("inline-flex items-center justify-center gap-2 rounded-xl font-medium transition",
        size === "sm" ? "h-8 px-3 text-sm" : "h-10 px-4 text-sm", btn[variant], className)}
      {...p}
    />
  );
}

const field = "w-full rounded-xl border border-line bg-white px-3 py-2 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";
export function Input({ className, ...p }: ComponentProps<"input">) {
  return <input className={cx(field, "h-10", className)} {...p} />;
}
export function Select({ className, ...p }: ComponentProps<"select">) {
  return <select className={cx(field, "h-10", className)} {...p} />;
}
export function Textarea({ className, ...p }: ComponentProps<"textarea">) {
  return <textarea className={cx(field, className)} {...p} />;
}
export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={cx("block space-y-1", className)}>
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

const tones = {
  neutral: "bg-stone-100 text-stone-700",
  good: "bg-green-50 text-green-700",
  warn: "bg-amber-50 text-amber-800",
  bad: "bg-red-50 text-red-700",
  brand: "brand-tint text-brand",
};
export function Badge({ tone = "neutral", children, className }: { tone?: keyof typeof tones; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", tones[tone], className)}>{children}</span>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone, href }: { label: string; value: string; sub?: string; tone?: "good" | "bad" | "warn"; href?: string }) {
  const body = (
    <Card className="p-3 sm:p-4 h-full">
      <div className="text-xs text-muted">{label}</div>
      <div className={cx("mt-1 text-lg sm:text-xl font-semibold tabular", tone === "good" && "text-good", tone === "bad" && "text-bad", tone === "warn" && "text-warn")}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </Card>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Card className="p-8 text-center">
      <div className="font-medium">{title}</div>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </Card>
  );
}

export function Section({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={cx("p-4", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

export function Table({ head, children, className }: { head: ReactNode[]; children: ReactNode; className?: string }) {
  return (
    <div className={cx("overflow-x-auto", className)}>
      <table className="w-full text-sm tabular">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            {head.map((h, i) => <th key={i} className="whitespace-nowrap px-2 py-2 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}
export const Td = ({ className, ...p }: ComponentProps<"td">) => <td className={cx("px-2 py-2 align-top", className)} {...p} />;

export function Money({ v, signed, className }: { v: number; signed?: "in" | "out"; className?: string }) {
  const s = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Math.round(v));
  return <span className={cx("tabular whitespace-nowrap", signed === "in" && "text-good", signed === "out" && "text-bad", className)}>{signed === "in" ? "+" : signed === "out" ? "−" : ""}{s}</span>;
}
