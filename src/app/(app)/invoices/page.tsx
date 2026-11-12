import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/session";
import { can } from "@/lib/permissions";
import { loadBook } from "@/lib/db";
import { dmy } from "@/lib/format";
import { Badge, Card, LinkButton, Money, PageHeader, cx } from "@/components/ui";

const TABS = [["invoice", "Invoices"], ["quotation", "Quotations"], ["receipt", "Receipts"]] as const;
const tone = { draft: "neutral", sent: "warn", paid: "good", cancelled: "bad" } as const;

export default async function Invoices({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const s = await requireCompany();
  if (!can.documents(s.role) && !can.viewFinancials(s.role)) redirect("/dashboard");
  const { type = "invoice" } = await searchParams;
  const b = await loadBook(s.company_id);
  const list = b.invoices.filter((i) => i.doc_type === type);
  const pname = (id: string | null) => b.parties.find((p) => p.id === id)?.name ?? "—";
  return (
    <div className="space-y-4">
      <PageHeader title="Invoices, quotations & receipts" actions={can.documents(s.role) ? <LinkButton href={`/invoices/new?type=${type}`} variant="primary">+ New {type}</LinkButton> : undefined} />
      <div className="flex gap-1">{TABS.map(([k, l]) => <Link key={k} href={`/invoices?type=${k}`} className={cx("rounded-full border px-3 py-1 text-sm", type === k ? "border-brand bg-brand text-white" : "border-line bg-white")}>{l}</Link>)}</div>
      <Card className="divide-y divide-line">
        {list.map((i) => (
          <Link key={i.id} href={`/invoices/${i.id}`} className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-stone-50">
            <div className="min-w-0"><div className="font-medium">{i.number} <Badge tone={tone[i.status]}>{i.status}</Badge></div><div className="truncate text-xs text-muted">{pname(i.party_id)} · {dmy(i.doc_date)}</div></div>
            <Money v={i.total} className="font-semibold" />
          </Link>
        ))}
        {!list.length && <div className="p-6 text-center text-sm text-muted">None yet.</div>}
      </Card>
    </div>
  );
}
