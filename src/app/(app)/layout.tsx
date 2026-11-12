import Link from "next/link";
import { requireCompany } from "@/lib/session";
import { getCompany } from "@/lib/db";
import { can, ROLE_LABEL } from "@/lib/permissions";
import { NavLinks } from "@/components/nav";
import { OfflineSync } from "@/components/offline-sync";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireCompany();
  const company = await getCompany(s.company_id);
  const fin = can.viewFinancials(s.role);
  return (
    <div style={{ ["--brand" as string]: company.brand_color || "#0f766e" }} className="min-h-dvh pb-24 md:pb-0 md:pl-60">
      {/* Desktop sidebar */}
      <aside className="no-print fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line bg-white md:flex">
        <Brand company={company} />
        <nav className="flex-1 overflow-y-auto px-3 py-2"><NavLinks role={s.role} variant="side" /></nav>
        <UserBox name={s.name ?? s.phone} role={ROLE_LABEL[s.role]} />
      </aside>

      {/* Mobile header */}
      <header className="no-print sticky top-0 z-20 flex items-center justify-between border-b border-line bg-white/95 px-4 py-2 backdrop-blur md:hidden">
        <Brand company={company} compact />
        <Link href="/more" className="rounded-lg px-2 py-1 text-sm text-muted">Menu</Link>
      </header>

      {company.sso_return_url && (
        <div className="no-print border-b border-line bg-stone-50 px-4 py-1.5 text-xs md:px-8">
          <a href={company.sso_return_url} className="text-brand hover:underline">← Back to {company.app_label || company.name}</a>
        </div>
      )}
      {company.is_demo && (
        <div className="no-print bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-900">Demo company with sample data — try anything, it isn't real.</div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-4 md:px-8 md:py-6">{children}</main>

      {/* Mobile bottom nav with the big + Add */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="relative grid grid-cols-5 text-[11px]">
          <BottomLink href={fin ? "/dashboard" : "/transactions"} label="Home" icon="⌂" />
          <BottomLink href="/registers/cash" label="Books" icon="▤" />
          <div className="flex justify-center">
            {can.addEntries(s.role) ? (
              <Link href="/add" aria-label="Add entry" className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-3xl leading-none text-white shadow-lg">+</Link>
            ) : <span />}
          </div>
          <BottomLink href={fin ? "/chat" : "/registers/review"} label={fin ? "Ask AI" : "Review"} icon={fin ? "✦" : "✓"} />
          <BottomLink href="/more" label="More" icon="≡" />
        </div>
      </nav>
      <OfflineSync />
    </div>
  );
}

function Brand({ company, compact }: { company: { name: string; logo_url: string | null }; compact?: boolean }) {
  return (
    <Link href="/dashboard" className={compact ? "flex items-center gap-2" : "flex items-center gap-2 px-5 py-5"}>
      {company.logo_url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={company.logo_url} alt="" className="h-8 w-8 rounded-lg object-cover" />
        : <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">{company.name.slice(0, 1)}</span>}
      <span className="max-w-[60vw] truncate font-semibold">{company.name}</span>
    </Link>
  );
}

function UserBox({ name, role }: { name: string; role: string }) {
  return (
    <div className="border-t border-line p-4 text-sm">
      <div className="truncate font-medium">{name}</div>
      <div className="text-xs text-muted">{role}</div>
      <form action="/api/auth/logout" method="post" className="mt-2">
        <button className="text-xs text-muted hover:text-ink">Log out</button>
      </form>
    </div>
  );
}

function BottomLink({ href, label, icon }: { href: string; label: string; icon: string }) {
  return (
    <Link href={href} className="flex flex-col items-center gap-0.5 py-2 text-muted">
      <span className="text-lg leading-none">{icon}</span>
      {label}
    </Link>
  );
}
