import { notFound } from "next/navigation";
import { sb } from "@/lib/supabase";
import { loadBook } from "@/lib/db";
import { projectStats, receivables } from "@/lib/ledger";
import { dmy, inr, todayISO } from "@/lib/format";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

/** Client-facing project statement: what was agreed, what's due, what's been paid. No costs or margins. */
export default async function ProjectStatement({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{24}$/.test(token)) notFound();
  const { data: proj } = await sb().from("projects").select("id,company_id").eq("share_token", token).is("deleted_at", null).maybeSingle();
  if (!proj) notFound();
  const b = await loadBook(proj.company_id);
  const x = projectStats(b).find((p) => p.project.id === proj.id)!;
  const payments = b.txns.filter((t) => t.project_id === proj.id && t.entry_type === "money" && t.direction === "in");
  const rec = x.client ? receivables(b).find((r) => r.client_id === x.client!.id) : null;
  const c = b.company;
  return (
    <main className="min-h-dvh bg-stone-100 p-3 sm:p-8">
      <div className="no-print mx-auto mb-3 flex max-w-3xl justify-end"><PrintButton label="Download PDF" /></div>
      <div className="print-page mx-auto max-w-3xl space-y-5 rounded-2xl bg-white p-6 text-sm sm:p-10">
        <div className="border-b-4 pb-3" style={{ borderColor: c.brand_color }}>
          <div className="text-xl font-bold" style={{ color: c.brand_color }}>{c.legal_name || c.name}</div>
          <div className="text-xs text-stone-500">{[c.phone, c.email].filter(Boolean).join(" · ")}</div>
        </div>
        <div>
          <div className="text-lg font-semibold">Project statement — {x.project.name}</div>
          <div className="text-xs text-stone-500">{x.client?.name} · {x.project.site_address} · as on {dmy(todayISO())}</div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl bg-stone-50 p-3"><div className="text-xs text-stone-500">Contract value</div><div className="text-lg font-semibold">{inr(x.contract)}</div></div>
          <div className="rounded-xl bg-stone-50 p-3"><div className="text-xs text-stone-500">Paid</div><div className="text-lg font-semibold text-green-700">{inr(x.received)}</div></div>
          <div className="rounded-xl bg-stone-50 p-3"><div className="text-xs text-stone-500">Balance</div><div className="text-lg font-semibold">{inr(x.pendingFromClient)}</div></div>
        </div>
        {x.stages.length > 0 && (
          <table className="w-full text-xs">
            <thead><tr className="border-b text-left text-stone-500"><th className="py-1">Milestone</th><th>Due</th><th className="text-right">Amount</th><th className="text-right">Status</th></tr></thead>
            <tbody>{x.stages.map((s) => <tr key={s.id} className="border-b border-stone-100"><td className="py-1.5">{s.name}{s.is_extra ? " (extra work)" : ""}</td><td>{dmy(s.due_date)}</td><td className="text-right">{inr(s.amount)}</td><td className="text-right capitalize">{s.status}</td></tr>)}</tbody>
          </table>
        )}
        <div>
          <div className="mb-1 font-semibold">Payments received</div>
          <table className="w-full text-xs"><tbody>
            {payments.map((t) => <tr key={t.id} className="border-b border-stone-100"><td className="py-1.5">{dmy(t.txn_date)}</td><td className="uppercase">{t.mode}</td><td>{t.reference ?? ""}</td><td className="text-right">{inr(t.amount)}</td></tr>)}
            {!payments.length && <tr><td className="py-2 text-stone-500">No payments yet.</td></tr>}
          </tbody></table>
        </div>
        {rec && rec.outstanding > 0 && <div className="rounded-xl bg-amber-50 p-3 text-amber-900">Amount due now: <b>{inr(rec.outstanding)}</b>{c.upi_id && <> · Pay by UPI: <b>{c.upi_id}</b></>}</div>}
        {c.bank_account_no && <div className="text-xs text-stone-500">Bank: {c.bank_name} · A/c {c.bank_account_no} · IFSC {c.bank_ifsc}</div>}
      </div>
    </main>
  );
}
