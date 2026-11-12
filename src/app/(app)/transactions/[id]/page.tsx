import { notFound } from "next/navigation";
import { requireCompany } from "@/lib/session";
import { sb } from "@/lib/supabase";
import { normTxn } from "@/lib/db";
import { getRefs } from "@/lib/refs";
import { can } from "@/lib/permissions";
import { Badge, Card, PageHeader } from "@/components/ui";
import { EditEntry } from "./edit";
import Link from "next/link";

export default async function TxnPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireCompany();
  const { id } = await params;
  const { data } = await sb().from("transactions").select("*").eq("id", id).eq("company_id", s.company_id).is("deleted_at", null).maybeSingle();
  if (!data) notFound();
  const t = normTxn(data);
  const [refs, { data: logs }, { data: company }] = await Promise.all([
    getRefs(s.company_id),
    sb().from("audit_log").select("action,at,user_id,app_users(name,phone)").eq("company_id", s.company_id).eq("entity_id", id).order("at", { ascending: false }).limit(20),
    sb().from("companies").select("lock_before").eq("id", s.company_id).single(),
  ]);
  const locked = !!company?.lock_before && t.txn_date < company.lock_before;
  const editable = !locked && (can.editEntries(s.role) || (t.created_by === s.uid && t.status !== "confirmed"));
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageHeader title="Entry" subtitle={<span className="flex flex-wrap gap-1.5"><Badge>{t.source.replace("_", " ")}</Badge><Badge tone={t.status === "confirmed" ? "good" : "warn"}>{t.status.replace("_", " ")}</Badge>{locked && <Badge tone="bad">Locked period</Badge>}{t.transfer_group && <Badge>Transfer</Badge>}</span>} />
      <EditEntry t={t} refs={refs} editable={editable} canDelete={!locked && (can.deleteEntries(s.role) || (t.created_by === s.uid && t.status !== "confirmed"))} />
      {t.direction === "in" && t.entry_type === "money" && can.documents(s.role) && (
        <Link href={t.invoice_id ? `/invoices/${t.invoice_id}` : `/invoices/new?txn=${t.id}`} className="block rounded-2xl border border-line bg-white p-3 text-center text-sm text-brand">
          {t.invoice_id ? "View receipt / invoice" : "Make a payment receipt for this"}
        </Link>
      )}
      <Card className="p-4">
        <div className="mb-2 text-sm font-semibold">History</div>
        <ul className="space-y-1 text-xs text-muted">
          {(logs ?? []).map((l: any, i: number) => (
            <li key={i}>{new Date(l.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} — {l.action} by {l.app_users?.name ?? l.app_users?.phone ?? "system"}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
