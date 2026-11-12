import Link from "next/link";
import { requireCompany } from "@/lib/session";
import { loadBook } from "@/lib/db";
import { partyStatement } from "@/lib/ledger";
import { can } from "@/lib/permissions";
import { Card, Money, PageHeader, cx } from "@/components/ui";
import { NewParty } from "./new-party";

const TYPES = [["client", "Clients"], ["vendor", "Vendors"], ["labour", "Labour"], ["other", "Other"]] as const;

export default async function Parties({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const s = await requireCompany();
  const { type = "client" } = await searchParams;
  const b = await loadBook(s.company_id);
  const list = b.parties.filter((p) => p.type === type);
  const fin = can.viewFinancials(s.role);
  return (
    <div className="space-y-4">
      <PageHeader title="Clients, vendors & labour" actions={can.addEntries(s.role) ? <NewParty type={type} /> : undefined} />
      <div className="flex gap-1 overflow-x-auto">
        {TYPES.map(([k, l]) => <Link key={k} href={`/parties?type=${k}`} className={cx("rounded-full border px-3 py-1 text-sm", type === k ? "border-brand bg-brand text-white" : "border-line bg-white")}>{l} ({b.parties.filter((p) => p.type === k).length})</Link>)}
      </div>
      <Card className="divide-y divide-line">
        {list.map((p) => {
          const st = fin ? partyStatement(b, p.id) : null;
          return (
            <Link key={p.id} href={`/parties/${p.id}`} className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-stone-50">
              <div className="min-w-0"><div className="truncate font-medium">{p.name}</div><div className="text-xs text-muted">{[p.trade, p.phone, p.gstin].filter(Boolean).join(" · ")}</div></div>
              {st && st.balance !== 0 && <div className="text-right text-sm"><Money v={Math.abs(st.balance)} className={st.balance > 0 ? "text-warn" : "text-muted"} /><div className="text-xs text-muted">{st.kind === "client" ? (st.balance > 0 ? "owes you" : "advance") : st.balance > 0 ? "you owe" : "advance"}</div></div>}
            </Link>
          );
        })}
        {!list.length && <div className="p-6 text-center text-sm text-muted">None yet.</div>}
      </Card>
    </div>
  );
}
