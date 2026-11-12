"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/types";

export type NavItem = { href: string; label: string; show?: (r: Role) => boolean };
const fin = (r: Role) => r !== "staff";
const mgr = (r: Role) => r === "owner" || r === "admin";

export const NAV: { section: string; items: NavItem[] }[] = [
  { section: "", items: [
    { href: "/dashboard", label: "Dashboard", show: fin },
    { href: "/add", label: "+ Add entry", show: (r) => r !== "accountant" },
    { href: "/chat", label: "Ask your accounts", show: fin },
    { href: "/alerts", label: "Alerts", show: fin },
  ] },
  { section: "Registers", items: [
    { href: "/registers/cash", label: "Cash book", show: fin },
    { href: "/registers/bank", label: "Bank & UPI book", show: fin },
    { href: "/registers/clients", label: "Client payments", show: fin },
    { href: "/registers/expenses", label: "Office expenses", show: fin },
    { href: "/projects", label: "Project accounts" },
    { href: "/registers/vendors", label: "Vendor accounts", show: fin },
    { href: "/registers/labour", label: "Labour / contractors", show: fin },
    { href: "/registers/gst", label: "GST register", show: fin },
    { href: "/registers/review", label: "Pending review" },
    { href: "/transactions", label: "All entries" },
  ] },
  { section: "Documents", items: [
    { href: "/invoices", label: "Invoices & quotations", show: mgr },
    { href: "/reports", label: "Reports", show: fin },
    { href: "/import", label: "Import bank / Excel", show: mgr },
  ] },
  { section: "Setup", items: [
    { href: "/parties", label: "Clients, vendors, labour" },
    { href: "/settings", label: "Settings", show: mgr },
  ] },
];

export function NavLinks({ role, variant }: { role: Role; variant: "side" | "list" }) {
  const path = usePathname();
  return (
    <div className="space-y-4">
      {NAV.map((g) => {
        const items = g.items.filter((i) => !i.show || i.show(role));
        if (!items.length) return null;
        return (
          <div key={g.section}>
            {g.section && <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{g.section}</div>}
            <div className={variant === "list" ? "divide-y divide-line rounded-2xl border border-line bg-white" : "space-y-0.5"}>
              {items.map((i) => {
                const active = path === i.href || (i.href !== "/dashboard" && path.startsWith(i.href + "/"));
                return (
                  <Link key={i.href} href={i.href}
                    className={variant === "list"
                      ? "flex items-center justify-between px-4 py-3 text-sm"
                      : `block rounded-lg px-2 py-1.5 text-sm ${active ? "brand-tint font-medium text-brand" : "text-ink hover:bg-stone-100"}`}>
                    {i.label}{variant === "list" && <span className="text-muted">›</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
