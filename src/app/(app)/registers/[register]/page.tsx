import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireCompany } from "@/lib/session";
import { can } from "@/lib/permissions";
import { loadBook } from "@/lib/db";
import { getRefs } from "@/lib/refs";
import { accountRegister, dailyClosing, gstSummary, indexBook, payables, receivables, groupOf, catName } from "@/lib/ledger";
import { dmy, fyOf, fyRange, inr, monthLabel, todayISO } from "@/lib/format";
import { Badge, Card, Empty, LinkButton, Money, PageHeader, Section, Stat, Table, Td } from "@/components/ui";
import { TxnTable } from "@/components/txn-list";
import { RangeFilter } from "@/components/range-filter";
import { ReviewList } from "./review-list";
import { ReconcileToggle } from "./reconcile";

const TITLES: Record<string, string> = {
  cash: "Cash book", bank: "Bank & UPI book", clients: "Client payments", expenses: "Office expenses & overheads",
  vendors: "Vendor accounts", labour: "Labour / contractor register", gst: "GST register", review: "Pending review",
};

type SP = { from?: string; to?: string; account?: string };

export default async function Register({ params, searchParams }: { params: Promise<{ register: string }>; searchParams: Promise<SP> }) {
  const s = await requireCompany();
  const { register } = await params;
  const sp = await searchParams;
  if (!TITLES[register]) notFound();
  if (register !== "review" && !can.viewFinancials(s.role)) redirect("/registers/review");
  const b = await loadBook(s.company_id);
  const ix = indexBook(b);
  const today = todayISO();
  const fy = fyRange(fyOf(today, b.company.fy_start_month), b.company.fy_start_month);
  const from = sp.from ?? fy.from, to = sp.to ?? today;
  const header = <PageHeader title={TITLES[register]} subtitle={register === "review" ? "Check AI drafts and approximate entries, then confirm" : `${dmy(from)} – ${dmy(to)}`}
    actions={register !== "review" && can.export(s.role) ? <LinkButton href={`/api/export/excel?from=${from}&to=${to}`} size="sm">Export Excel</LinkButton> : undefined} />;

  if (register === "cash" || register === "bank") {
    const accs = b.accounts.filter((a) => (register === "cash" ? a.type === "cash" : a.type !== "cash"));
    const selected = sp.account && accs.some((a) => a.id === sp.account) ? [sp.account] : accs.map((a) => a.id);
    const reg = accountRegister(b, selected, from, to);
    const closing = reg.rows.length ? reg.rows[reg.rows.length - 1].balance : reg.opening;
    const days = dailyClosing(reg.rows).reverse();
    return (
      <div className="space-y-4">
        {header}
        <RangeFilter from={from} to={to} extra={accs.length > 1 ? (
          <select name="account" defaultValue={sp.account ?? ""} className="h-10 rounded-xl border border-line px-3">
            <option value="">All {register} accounts</option>{accs.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>) : undefined} />
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Opening" value={inr(reg.opening)} />
          <Stat label="In / Out" value={`${inr(reg.rows.filter((r) => r.t.direction === "in").reduce((s, r) => s + r.t.amount, 0))}`} sub={`out ${inr(reg.rows.filter((r) => r.t.direction === "out").reduce((s, r) => s + r.t.amount, 0))}`} />
          <Stat label="Closing" value={inr(closing)} tone={closing < 0 ? "bad" : undefined} />
        </div>
        {register === "bank" ? (
          <Section title="Entries">
            <Table head={["Date", "Details", "Mode", "In", "Out", "Balance", "Reconciled"]}>
              {[...reg.rows].reverse().map(({ t, balance }) => (
                <tr key={t.id}>
                  <Td className="whitespace-nowrap text-muted">{dmy(t.txn_date)}</Td>
                  <Td><Link href={`/transactions/${t.id}`}>{catName(t, ix)}{t.party_id ? ` · ${ix.party.get(t.party_id)?.name}` : ""}<div className="text-xs text-muted">{[t.notes, t.reference].filter(Boolean).join(" · ")}</div></Link></Td>
                  <Td className="text-xs uppercase text-muted">{t.mode}</Td>
                  <Td className="text-right">{t.direction === "in" && <Money v={t.amount} className="text-good" />}</Td>
                  <Td className="text-right">{t.direction === "out" && <Money v={t.amount} className="text-bad" />}</Td>
                  <Td className="text-right"><Money v={balance} /></Td>
                  <Td><ReconcileToggle id={t.id} value={t.reconciled} disabled={!can.editEntries(s.role)} /></Td>
                </tr>
              ))}
            </Table>
          </Section>
        ) : (
          <>
            <Section title="Daily closing">
              <Table head={["Date", "Received", "Paid", "Closing"]}>
                {days.slice(0, 31).map((d) => (
                  <tr key={d.date}><Td>{dmy(d.date)}</Td><Td className="text-right text-good"><Money v={d.in} /></Td><Td className="text-right text-bad"><Money v={d.out} /></Td><Td className="text-right font-medium"><Money v={d.closing} /></Td></tr>
                ))}
              </Table>
            </Section>
            <Section title="Entries"><TxnTable rows={[...reg.rows].reverse()} ix={ix} balance showMode={false} /></Section>
          </>
        )}
      </div>
    );
  }

  if (register === "clients") {
    const rec = receivables(b, today);
    const receipts = b.txns.filter((t) => t.entry_type === "money" && t.direction === "in" && t.txn_date >= from && t.txn_date <= to && groupOf(t, ix) === "Income");
    const tot = (k: "0-30" | "31-60" | "60+") => rec.reduce((s, r) => s + r.buckets[k], 0);
    return (
      <div className="space-y-4">
        {header}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Total due now" value={inr(rec.reduce((s, r) => s + r.outstanding, 0))} tone="warn" />
          <Stat label="0–30 days" value={inr(tot("0-30"))} />
          <Stat label="31–60 days" value={inr(tot("31-60"))} />
          <Stat label="60+ days" value={inr(tot("60+"))} tone="bad" />
        </div>
        <Section title="By client">
          <Table head={["Client", "Contract", "Received", "Due now", "0–30", "31–60", "60+", "Left on contract", ""]}>
            {rec.map((r) => (
              <tr key={r.client_id}>
                <Td><Link href={`/parties/${r.client_id}`} className="font-medium">{r.party?.name}</Link><div className="text-xs text-muted">{r.projects.map((p) => p.name).join(", ")}</div></Td>
                <Td className="text-right"><Money v={r.contractBalance + r.received} /></Td>
                <Td className="text-right text-good"><Money v={r.received} /></Td>
                <Td className="text-right font-semibold text-warn"><Money v={r.outstanding} /></Td>
                <Td className="text-right"><Money v={r.buckets["0-30"]} /></Td>
                <Td className="text-right"><Money v={r.buckets["31-60"]} /></Td>
                <Td className="text-right text-bad"><Money v={r.buckets["60+"]} /></Td>
                <Td className="text-right text-muted"><Money v={r.contractBalance} /></Td>
                <Td>{r.outstanding > 0 && r.party?.phone && <WhatsApp name={r.party.name} phone={r.party.phone} amount={r.outstanding} company={b.company.name} upi={b.company.upi_id} />}</Td>
              </tr>
            ))}
          </Table>
          <p className="mt-2 text-xs text-muted">“Due now” = milestone stages whose due date has passed (or that were invoiced) + invoices, minus payments received (oldest first).</p>
        </Section>
        <Section title="Payments received"><TxnTable rows={[...receipts].reverse().map((t) => ({ t }))} ix={ix} /></Section>
      </div>
    );
  }

  if (register === "expenses") {
    const rows = b.txns.filter((t) => t.entry_type === "money" && t.direction === "out" && groupOf(t, ix) === "Overheads" && t.txn_date >= from && t.txn_date <= to);
    const byCat = new Map<string, number>();
    rows.forEach((t) => byCat.set(catName(t, ix), (byCat.get(catName(t, ix)) ?? 0) + t.amount));
    const months = new Map<string, number>();
    rows.forEach((t) => months.set(t.txn_date.slice(0, 7), (months.get(t.txn_date.slice(0, 7)) ?? 0) + t.amount));
    return (
      <div className="space-y-4">
        {header}
        <RangeFilter from={from} to={to} />
        <div className="grid gap-4 md:grid-cols-2">
          <Section title="By category">
            <Table head={["Category", "Amount"]}>{[...byCat].sort((a, b) => b[1] - a[1]).map(([k, v]) => <tr key={k}><Td>{k}</Td><Td className="text-right"><Money v={v} /></Td></tr>)}
              <tr className="font-semibold"><Td>Total</Td><Td className="text-right"><Money v={rows.reduce((s, t) => s + t.amount, 0)} /></Td></tr></Table>
          </Section>
          <Section title="By month">
            <Table head={["Month", "Amount"]}>{[...months].sort().reverse().map(([k, v]) => <tr key={k}><Td>{monthLabel(k)}</Td><Td className="text-right"><Money v={v} /></Td></tr>)}</Table>
          </Section>
        </div>
        <Section title="Entries"><TxnTable rows={[...rows].reverse().map((t) => ({ t }))} ix={ix} /></Section>
      </div>
    );
  }

  if (register === "vendors" || register === "labour") {
    const list = payables(b, register === "vendors" ? "vendor" : "labour", today);
    return (
      <div className="space-y-4">
        {header}
        <div className="grid grid-cols-2 gap-3">
          <Stat label={register === "vendors" ? "We owe vendors" : "Balance due to labour"} value={inr(list.reduce((s, p) => s + Math.max(0, p.balance), 0))} tone="warn" />
          <Stat label={register === "vendors" ? "Advances with vendors" : "Advances given"} value={inr(list.reduce((s, p) => s + Math.max(0, -p.balance), 0))} />
        </div>
        {!list.length ? <Empty title={`No ${register} added yet`}>They're created automatically when you add an entry with a new name.</Empty> : (
          <Section title={register === "vendors" ? "Vendors" : "Contractors & workers"}>
            <Table head={register === "vendors"
              ? ["Vendor", "Bills (credit)", "Paid against bills", "Outstanding", "Next due", "This FY paid"]
              : ["Name", "Work done", "Paid (incl. advances)", "Balance", "This FY paid", "TDS 194C"]}>
              {list.map((p) => {
                const next = p.dues.find((d) => d.due);
                return (
                  <tr key={p.party.id}>
                    <Td><Link href={`/parties/${p.party.id}`} className="font-medium">{p.party.name}</Link>{p.party.trade && <div className="text-xs capitalize text-muted">{p.party.trade}</div>}</Td>
                    <Td className="text-right"><Money v={p.billed} /></Td>
                    <Td className="text-right"><Money v={p.paid} /></Td>
                    <Td className="text-right font-semibold">{p.balance >= 0 ? <Money v={p.balance} className="text-warn" /> : <span className="text-muted">Advance <Money v={-p.balance} /></span>}</Td>
                    {register === "vendors"
                      ? <Td>{next ? <span className={next.overdue ? "text-bad" : ""}>{dmy(next.due)} · <Money v={next.outstanding} /></span> : "—"}</Td>
                      : null}
                    <Td className="text-right"><Money v={p.fyTotal} /></Td>
                    {register === "labour" && <Td>{p.tdsFlag ? <Badge tone={p.tdsDeducted ? "good" : "bad"}>{p.tdsDeducted ? `Deducted ${inr(p.tdsDeducted)}` : "Threshold crossed"}</Badge> : <span className="text-xs text-muted">Below limit</span>}</Td>}
                  </tr>
                );
              })}
            </Table>
            {register === "labour"
              ? <p className="mt-2 text-xs text-muted">Record “Labour work done” entries for completed work; every payment counts against it, so advances show clearly. TDS u/s 194C flag: single payment above ₹30,000 or total above ₹1,00,000 in the financial year — confirm with your CA.</p>
              : <p className="mt-2 text-xs text-muted">Outstanding = credit bills (“Bill (credit)” entries) minus payments marked “pays an earlier bill”. Purchases paid on the spot don't create a balance.</p>}
          </Section>
        )}
      </div>
    );
  }

  if (register === "gst") {
    if (!b.company.gstin) return <div className="space-y-4">{header}<Empty title="GST is switched off">Add your GSTIN in Settings to turn on GST invoices and this register.</Empty></div>;
    const g = gstSummary(b, from, to);
    const inputs = b.txns.filter((t) => t.gst_amount > 0 && t.txn_date >= from && t.txn_date <= to);
    return (
      <div className="space-y-4">
        {header}
        <RangeFilter from={from} to={to} />
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Output GST" value={inr(g.output)} />
          <Stat label="Input GST (ITC)" value={inr(g.input)} />
          <Stat label="Net payable" value={inr(g.net)} tone={g.net > 0 ? "warn" : "good"} />
        </div>
        <Section title="Monthly summary (GSTR-1 / 3B style)">
          <Table head={["Month", "Taxable (invoices)", "B2B", "B2C", "CGST", "SGST", "IGST", "Output", "Input (ITC)", "Net"]}>
            {g.months.map((m) => (
              <tr key={m.month}><Td>{monthLabel(m.month)}</Td><Td className="text-right"><Money v={m.taxable} /></Td><Td className="text-right"><Money v={m.b2b} /></Td><Td className="text-right"><Money v={m.b2c} /></Td>
                <Td className="text-right"><Money v={m.outCgst} /></Td><Td className="text-right"><Money v={m.outSgst} /></Td><Td className="text-right"><Money v={m.outIgst} /></Td>
                <Td className="text-right"><Money v={m.output} /></Td><Td className="text-right"><Money v={m.input} /></Td><Td className="text-right font-semibold"><Money v={m.net} /></Td></tr>
            ))}
          </Table>
          <p className="mt-2 text-xs text-muted">Summary to help you and your CA. File actual returns on the GST portal.</p>
        </Section>
        <Section title="Entries with GST"><TxnTable rows={[...inputs].reverse().map((t) => ({ t }))} ix={ix} /></Section>
      </div>
    );
  }

  // review
  const refs = await getRefs(s.company_id);
  const pending = s.role === "staff" ? b.pending.filter((t) => t.created_by === s.uid) : b.pending;
  return (
    <div className="space-y-4">
      {header}
      {!pending.length ? <Empty title="Nothing to review 🎉">AI drafts you save for later and “from memory” entries show up here.</Empty>
        : <ReviewList items={pending} refs={refs} canConfirm={can.editEntries(s.role)} />}
      <Card className="p-3 text-xs text-muted">Entries here are not counted in balances or reports until confirmed.</Card>
    </div>
  );
}

function WhatsApp({ name, phone, amount, company, upi }: { name: string; phone: string; amount: number; company: string; upi: string | null }) {
  const digits = phone.replace(/\D/g, "");
  const msg = `Namaste ${name} ji, a gentle reminder from ${company}: ₹${Math.round(amount).toLocaleString("en-IN")} is pending.${upi ? ` UPI: ${upi}.` : ""} Thank you!`;
  return <a target="_blank" href={`https://wa.me/${digits.length === 10 ? "91" + digits : digits}?text=${encodeURIComponent(msg)}`} className="whitespace-nowrap rounded-lg bg-green-600 px-2 py-1 text-xs text-white">WhatsApp</a>;
}
