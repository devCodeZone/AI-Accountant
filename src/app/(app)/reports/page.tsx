import Link from "next/link";
import { Fragment } from "react";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/session";
import { can } from "@/lib/permissions";
import { loadBook } from "@/lib/db";
import { gstSummary, indexBook, projectStats } from "@/lib/ledger";
import { cashflowReport, dayBook, plReport, tdsReport } from "@/lib/reports";
import { dmy, fyOf, fyRange, inr, monthLabel, todayISO } from "@/lib/format";
import { Badge, Card, LinkButton, Money, PageHeader, Section, Table, Td, cx } from "@/components/ui";
import { RangeFilter } from "@/components/range-filter";
import { PrintButton } from "@/components/print-button";

const TYPES = [
  ["pl", "Profit & Loss"], ["cashflow", "Cash flow"], ["projects", "Project statements"], ["parties", "Party ledgers"],
  ["gst", "GST summary"], ["tds", "TDS summary"], ["daybook", "Day book"],
] as const;

export default async function Reports({ searchParams }: { searchParams: Promise<{ type?: string; from?: string; to?: string }> }) {
  const s = await requireCompany();
  if (!can.viewFinancials(s.role)) redirect("/transactions");
  const sp = await searchParams;
  const type = sp.type ?? "pl";
  const b = await loadBook(s.company_id);
  const fy = fyRange(fyOf(todayISO(), b.company.fy_start_month), b.company.fy_start_month);
  const from = sp.from ?? fy.from, to = sp.to ?? todayISO();
  const q = `from=${from}&to=${to}`;

  return (
    <div className="space-y-4">
      <PageHeader title="Reports" subtitle={`${b.company.name} · ${dmy(from)} – ${dmy(to)}`}
        actions={<div className="no-print flex gap-2"><PrintButton /><LinkButton href={`/api/export/excel?${q}`} size="md">Excel (all registers)</LinkButton><LinkButton href={`/api/export/tally?${q}`} size="md">Tally CSV</LinkButton></div>} />
      <div className="no-print flex gap-1 overflow-x-auto pb-1">
        {TYPES.map(([k, l]) => <Link key={k} href={`/reports?type=${k}&${q}`} className={cx("whitespace-nowrap rounded-full border px-3 py-1 text-sm", type === k ? "border-brand bg-brand text-white" : "border-line bg-white")}>{l}</Link>)}
      </div>
      <RangeFilter from={from} to={to} extra={<input type="hidden" name="type" value={type} />} />
      <div className="hidden print:block"><b>{b.company.legal_name || b.company.name}</b> — {TYPES.find((t) => t[0] === type)?.[1]} — {dmy(from)} to {dmy(to)}</div>
      {type === "pl" && <PL b={b} from={from} to={to} />}
      {type === "cashflow" && <CashFlow b={b} from={from} to={to} />}
      {type === "projects" && <Projects b={b} />}
      {type === "parties" && <Parties b={b} />}
      {type === "gst" && <Gst b={b} from={from} to={to} />}
      {type === "tds" && <Tds b={b} from={from} to={to} />}
      {type === "daybook" && <DayBook b={b} from={from} to={to} />}
    </div>
  );
}

type B = Awaited<ReturnType<typeof loadBook>>;

function PL({ b, from, to }: { b: B; from: string; to: string }) {
  const p = plReport(b, from, to);
  return (
    <Section title="Profit & Loss (cash basis)">
      <Table head={["", "Amount"]}>
        {p.sections.map((s) => (
          <Fragment key={s.group}>
            <tr className="bg-stone-50 font-semibold"><Td>{s.group}</Td><Td className="text-right"><Money v={s.rows.reduce((a, r) => a + r.amount, 0)} /></Td></tr>
            {s.rows.map((r) => <tr key={s.group + r.name}><Td className="pl-6 text-muted">{r.name}</Td><Td className="text-right"><Money v={r.amount} /></Td></tr>)}
          </Fragment>
        ))}
        <tr className="font-semibold"><Td>Total income</Td><Td className="text-right text-good"><Money v={p.income} /></Td></tr>
        <tr><Td>Less: direct project costs (materials, labour, site)</Td><Td className="text-right"><Money v={p.direct} /></Td></tr>
        <tr className="font-semibold"><Td>Gross profit</Td><Td className="text-right"><Money v={p.gross} /></Td></tr>
        <tr><Td>Less: overheads</Td><Td className="text-right"><Money v={p.overheads} /></Td></tr>
        {p.byGroup["Uncategorised"] ? <tr><Td>Less: uncategorised</Td><Td className="text-right"><Money v={p.byGroup["Uncategorised"]} /></Td></tr> : null}
        <tr className="text-base font-bold"><Td>Net profit</Td><Td className={cx("text-right", p.net >= 0 ? "text-good" : "text-bad")}><Money v={p.net} /></Td></tr>
      </Table>
      <p className="mt-2 text-xs text-muted">Owner drawings, capital, loans, asset purchases, refunds and cash⇄bank transfers are excluded. Net margin {p.margin}%.</p>
    </Section>
  );
}

function CashFlow({ b, from, to }: { b: B; from: string; to: string }) {
  const c = cashflowReport(b, from, to);
  return (
    <div className="space-y-4">
      <Section title="Monthly cash flow">
        <Table head={["Month", "Cash in", "Cash out", "Bank in", "Bank out", "Net"]}>
          {c.rows.map((r) => <tr key={r.month}><Td>{monthLabel(r.month)}</Td><Td className="text-right"><Money v={r.cashIn} /></Td><Td className="text-right"><Money v={r.cashOut} /></Td><Td className="text-right"><Money v={r.bankIn} /></Td><Td className="text-right"><Money v={r.bankOut} /></Td><Td className="text-right font-semibold"><Money v={r.net} /></Td></tr>)}
        </Table>
        <p className="mt-2 text-xs text-muted">Includes both legs of cash⇄bank transfers (they cancel out in Net).</p>
      </Section>
      <Section title="Summary">
        <Table head={["", "Amount"]}>
          <tr><Td>From business operations</Td><Td className="text-right"><Money v={c.operating} /></Td></tr>
          {c.nonOperating.map((n) => <tr key={n.name}><Td>{n.name}</Td><Td className="text-right"><Money v={n.amount} /></Td></tr>)}
        </Table>
      </Section>
    </div>
  );
}

function Projects({ b }: { b: B }) {
  return (
    <Section title="Project statements">
      <Table head={["Project", "Contract", "Received", "Spent", "Cash profit", "Expected margin", "Share with client"]}>
        {projectStats(b).map((x) => (
          <tr key={x.project.id}>
            <Td><Link href={`/projects/${x.project.id}`} className="font-medium">{x.project.name}</Link><div className="text-xs text-muted">{x.client?.name}</div></Td>
            <Td className="text-right"><Money v={x.contract} /></Td><Td className="text-right"><Money v={x.received} /></Td><Td className="text-right"><Money v={x.spent} /></Td>
            <Td className="text-right"><Money v={x.profit} /></Td><Td><Badge tone={x.health === "green" ? "good" : x.health === "amber" ? "warn" : "bad"}>{x.expectedMargin}%</Badge></Td>
            <Td><a className="text-xs text-brand" target="_blank" href={`/share/project/${x.project.share_token}`}>Open ↗</a></Td>
          </tr>
        ))}
      </Table>
    </Section>
  );
}

function Parties({ b }: { b: B }) {
  return (
    <Card className="divide-y divide-line">
      {b.parties.map((p) => <Link key={p.id} href={`/parties/${p.id}`} className="flex justify-between px-4 py-2.5 text-sm hover:bg-stone-50"><span>{p.name}</span><span className="text-xs capitalize text-muted">{p.type} · open statement →</span></Link>)}
    </Card>
  );
}

function Gst({ b, from, to }: { b: B; from: string; to: string }) {
  if (!b.company.gstin) return <Card className="p-6 text-sm text-muted">GST is off (no GSTIN in settings).</Card>;
  const g = gstSummary(b, from, to);
  const inv = b.invoices.filter((i) => i.doc_type === "invoice" && i.status !== "cancelled" && i.doc_date >= from && i.doc_date <= to);
  const ix = indexBook(b);
  return (
    <div className="space-y-4">
      <Section title="GSTR-3B style summary">
        <Table head={["Month", "Output CGST", "Output SGST", "Output IGST", "Total output", "Input (ITC)", "Net payable"]}>
          {g.months.map((m) => <tr key={m.month}><Td>{monthLabel(m.month)}</Td><Td className="text-right"><Money v={m.outCgst} /></Td><Td className="text-right"><Money v={m.outSgst} /></Td><Td className="text-right"><Money v={m.outIgst} /></Td><Td className="text-right"><Money v={m.output} /></Td><Td className="text-right"><Money v={m.input} /></Td><Td className="text-right font-semibold"><Money v={m.net} /></Td></tr>)}
          <tr className="font-semibold"><Td>Total</Td><Td /><Td /><Td /><Td className="text-right"><Money v={g.output} /></Td><Td className="text-right"><Money v={g.input} /></Td><Td className="text-right"><Money v={g.net} /></Td></tr>
        </Table>
      </Section>
      <Section title="GSTR-1 style invoice list">
        <Table head={["Date", "Invoice", "Client", "Client GSTIN", "Type", "Taxable", "CGST", "SGST", "IGST", "Total"]}>
          {inv.map((i) => { const p = i.party_id ? ix.party.get(i.party_id) : null; return (
            <tr key={i.id}><Td>{dmy(i.doc_date)}</Td><Td><Link href={`/invoices/${i.id}`}>{i.number}</Link></Td><Td>{p?.name}</Td><Td>{p?.gstin ?? ""}</Td><Td>{p?.gstin ? "B2B" : "B2C"}</Td>
              <Td className="text-right"><Money v={i.subtotal} /></Td><Td className="text-right"><Money v={i.cgst} /></Td><Td className="text-right"><Money v={i.sgst} /></Td><Td className="text-right"><Money v={i.igst} /></Td><Td className="text-right"><Money v={i.total} /></Td></tr>); })}
        </Table>
      </Section>
    </div>
  );
}

function Tds({ b, from, to }: { b: B; from: string; to: string }) {
  const rows = tdsReport(b, from, to);
  return (
    <Section title="TDS summary — contractor payments (194C)">
      <Table head={["Party", "PAN", "Payments", "Total paid", "Largest single", "TDS deducted", ""]}>
        {rows.map((r) => <tr key={r.party}><Td>{r.party}</Td><Td>{r.pan ?? <span className="text-bad">missing</span>}</Td><Td>{r.payments}</Td><Td className="text-right"><Money v={r.paid} /></Td><Td className="text-right"><Money v={r.maxSingle} /></Td><Td className="text-right"><Money v={r.tds} /></Td><Td>{r.flag && <Badge tone={r.tds ? "good" : "bad"}>{r.tds ? "Deducted" : "Threshold crossed"}</Badge>}</Td></tr>)}
      </Table>
      <p className="mt-2 text-xs text-muted">194C thresholds: ₹30,000 single payment or ₹1,00,000 in a year. Rates and applicability vary — confirm with your CA.</p>
    </Section>
  );
}

function DayBook({ b, from, to }: { b: B; from: string; to: string }) {
  const rows = dayBook(b, from, to).reverse().slice(0, 1000);
  return (
    <Section title={`Day book (${rows.length} entries)`}>
      <Table head={["Date", "Voucher", "Category", "Party", "Project", "Account", "In", "Out"]}>
        {rows.map((r) => <tr key={r.t.id}><Td className="whitespace-nowrap">{dmy(r.date)}</Td><Td>{r.type}</Td><Td><Link href={`/transactions/${r.t.id}`}>{r.category}</Link></Td><Td>{r.party}</Td><Td>{r.project}</Td><Td>{r.account}</Td>
          <Td className="text-right">{r.t.direction === "in" ? <Money v={r.t.amount} /> : ""}</Td><Td className="text-right">{r.t.direction === "out" ? <Money v={r.t.amount} /> : ""}</Td></tr>)}
      </Table>
      <p className="mt-2 text-xs text-muted">Total in {inr(rows.filter((r) => r.t.direction === "in").reduce((s, r) => s + r.t.amount, 0))} · out {inr(rows.filter((r) => r.t.direction === "out").reduce((s, r) => s + r.t.amount, 0))}</p>
    </Section>
  );
}
