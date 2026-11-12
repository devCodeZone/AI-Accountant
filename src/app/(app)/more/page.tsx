import { requireCompany } from "@/lib/session";
import { NavLinks } from "@/components/nav";
import { ROLE_LABEL } from "@/lib/permissions";

export default async function More() {
  const s = await requireCompany();
  return (
    <div className="space-y-4">
      <NavLinks role={s.role} variant="list" />
      <div className="rounded-2xl border border-line bg-white p-4 text-sm">
        <div className="font-medium">{s.name ?? s.phone}</div>
        <div className="text-xs text-muted">{ROLE_LABEL[s.role]} · {s.phone}</div>
        <form action="/api/auth/logout" method="post" className="mt-3"><button className="text-sm text-bad">Log out</button></form>
      </div>
    </div>
  );
}
