import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCompany } from "@/lib/session";
import { loadBook } from "@/lib/db";
import { partyStatement, payables, receivables } from "@/lib/ledger";
import { can } from "@/lib/permissions";
import { dmy, inr } from "@/lib/format";
import { Badge, Card, Money, PageHeader, Section, Stat, Table, Td } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { EditParty } from "./edit-party";

export default async function PartyPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireCompany();
  const { id } = await params;
  const b = await loadBook(s.company_id);
  const p = b.parties.find((x) => x.id === id);
  if (!p) notFound();
  const fin = can.viewFinancials(s.role);
  const st = partyStatement(b, id);
  const rec = st.kind === "client" ? receivables(b).find((r) => r.client_id === id) : null;
  const pay = p.type === "vendor" || p.type === "labour" ? payables(b, p.type).find((x) => x.party.id === id) : null;
  const phone = (p.phone ?? "").replace(/\D/g, "");
  const wa = rec && rec.outstanding > 0 && phone ? `https://wa.me/${phone.length === 10 ? "91" + phone : phone}?text=${encodeURIComponent(`Namaste ${p.name} ji, a gentle reminder from ${b.company.name}: ₹${Math.round(rec.outstanding).toLocaleString("en-IN")} is pending.${b.company.upi_id ? ` UPI: ${b.company.upi_id}.` : ""} Thank you!`)}` : null;
  return (
    <div className="space-y-4">
      <PageHeader title={p.name} subtitle={<span className="capitalize">{p.type}{p.trade ? ` · ${p.trade}` : ""}{p.phone ? ` · ${p.phone}` : ""}{p.gstin ? ` · GSTIN ${p.gstin}` : ""}</span>}
        actions={<div className="no-print flex gap-2">{wa && <a href={wa} target="_blank" className="inline-flex h-10 items-center rounded-xl bg-green-600 px-4 text-sm text-white">WhatsApp reminder</a>}<PrintButton label="Print statement" /></div>} />
      {fin && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label={st.kind === "client" ? (st.balance >= 0 ? "Owes you" : "Advance with you") : st.balance >= 0 ? "You owe" : "Advance given"} value={inr(Math.abs(st.balance))} tone={st.balance > 0 ? "warn" : undefined} />
            {rec && <Stat label="Received so far" value={inr(rec.received)} tone="good" />}
            {rec && <Stat label="Left on contract" value={inr(rec.contractBalance)} />}
            {pay && <Stat label="Paid this FY" value={inr(pay.fyTotal)} />}
            {pay?.tdsFlag && <Stat label="TDS 194C" value={pay.tdsDeducted ? `Deducted ${inr(pay.tdsDeducted)}` : "Threshold crossed"} tone={pay.tdsDeducted ? "good" : "bad"} />}
          </div>
          <Section title="Ledger statement">
            <div className="mb-2 hidden text-sm print:block"><b>{b.company.name}</b> — statement for {p.name}, as on {dmy(new Date().toISOString().slice(0, 10))}</div>
            <Table head={["Date", "Particulars", st.kind === "client" ? "Due" : "Paid", st.kind === "client" ? "Received" : "Billed / work", "Balance"]}>
              {st.rows.map((r, i) => (
                <tr key={i}>
                  <Td className="whitespace-nowrap text-muted">{r.date === "1900-01-01" ? "—" : dmy(r.date)}</Td>
                  <Td>{r.txn_id ? <Link href={`/transactions/${r.txn_id}`}>{r.particulars}</Link> : r.particulars}</Td>
                  <Td className="text-right">{r.debit ? <Money v={r.debit} /> : ""}</Td>
                  <Td className="text-right">{r.credit ? <Money v={r.credit} /> : ""}</Td>
                  <Td className="text-right font-medium"><Money v={r.balance} /></Td>
                </tr>
              ))}
            </Table>
          </Section>
          {rec && rec.open.length > 0 && (
            <Section title="Pending items (oldest first)">
              <ul className="divide-y divide-line text-sm">{rec.open.map((o, i) => <li key={i} className="flex justify-between py-2"><span>{o.label} <Badge tone={o.age > 60 ? "bad" : o.age > 30 ? "warn" : "neutral"}>{o.age} days</Badge></span><Money v={o.outstanding} /></li>)}</ul>
            </Section>
          )}
        </>
      )}
      {can.editEntries(s.role) && <Card className="no-print p-4"><EditParty party={p} /></Card>}
    </div>
  );
}
