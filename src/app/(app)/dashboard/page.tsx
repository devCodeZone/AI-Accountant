import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/session";
import { can } from "@/lib/permissions";
import { loadBook } from "@/lib/db";
import { cashAndBank, cashflowTrend, describe, gstSummary, indexBook, monthlyIncomeExpense, payables, pnl, projectStats, receivables } from "@/lib/ledger";
import { dmy, fyOf, fyRange, inr, lastNMonths, monthLabel, monthRange, todayISO } from "@/lib/format";
import { Badge, Card, Input, LinkButton, Money, PageHeader, Section, Select, Stat } from "@/components/ui";
import { CashflowChart, HBarChart, HEALTH, IncomeExpenseChart } from "@/components/charts";

type SP = { from?: string; to?: string; project?: string; fy?: string };

export default async function Dashboard({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await requireCompany();
  if (!can.viewFinancials(s.role)) redirect("/transactions");
  const sp = await searchParams;
  const b = await loadBook(s.company_id);
  const ix = indexBook(b);
  const today = todayISO();
  const fyStart = b.company.fy_start_month;
  const curFy = fyOf(today, fyStart);
  const range = sp.fy ? fyRange(sp.fy, fyStart) : sp.from || sp.to ? { from: sp.from || "1900-01-01", to: sp.to || today } : monthRange(today);
  const label = sp.fy ? `FY ${sp.fy}` : sp.from || sp.to ? `${dmy(range.from)} – ${dmy(range.to)}` : "This month";
  const project = sp.project || undefined;

  const cb = cashAndBank(b);
  const rec = receivables(b, today);
  const vend = payables(b, "vendor", today);
  const lab = payables(b, "labour", today);
  const totalRec = rec.reduce((s, r) => s + r.outstanding, 0);
  const totalPay = [...vend, ...lab].reduce((s, p) => s + Math.max(0, p.balance), 0);
  const p = pnl(b, range.from, range.to, project);
  const gst = gstSummary(b, range.from, range.to);
  const months = lastNMonths(12, today);
  const monthly = monthlyIncomeExpense(b, months, project).map((m) => ({ ...m, label: monthLabel(m.month) }));
  const flow = cashflowTrend(b, months).map((m) => ({ ...m, label: monthLabel(m.month) }));
  const expenseCats = p.categories.filter((c) => c.direction === "out").slice(0, 8).map((c) => ({ name: c.name, value: c.amount }));
  const projects = projectStats(b).filter((x) => x.project.status !== "cancelled" && x.project.status !== "lead");
  const ageing = ["0-30", "31-60", "60+"].map((k, i) => ({ name: `${k} days`, value: rec.reduce((s, r) => s + r.buckets[k as "0-30"], 0), color: ["#d97706", "#ea580c", "#dc2626"][i] }));
  const vendorDues = [...vend, ...lab].flatMap((v) => v.dues.filter((d) => d.due).map((d) => ({ ...d, party: v.party }))).sort((a, b) => (a.due ?? "").localeCompare(b.due ?? "")).slice(0, 5);
  const latest = [...b.txns].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8);
  const fys = [curFy, fyOf(`${Number(curFy.slice(0, 4)) - 1}-${String(fyStart).padStart(2, "0")}-15`, fyStart)];

  return (
    <div className="space-y-4">
      <PageHeader title="Dashboard" subtitle={`${label}${project ? ` · ${ix.project.get(project)?.name ?? ""}` : ""}`}
        actions={<LinkButton href="/add" variant="primary">+ Add</LinkButton>} />

      <details className="no-print rounded-2xl border border-line bg-white text-sm" open={!!(sp.fy || sp.from || sp.to || sp.project)}>
      <summary className="cursor-pointer px-4 py-2.5 text-muted">Filter: period & project</summary>
      <form className="flex flex-wrap items-end gap-2 border-t border-line p-3">
        <Select name="fy" defaultValue={sp.fy ?? ""} className="w-auto">
          <option value="">Custom / this month</option>
          {fys.map((f) => <option key={f} value={f}>FY {f}</option>)}
        </Select>
        <Input type="date" name="from" defaultValue={sp.from} className="w-auto" />
        <Input type="date" name="to" defaultValue={sp.to} className="w-auto" />
        <Select name="project" defaultValue={sp.project ?? ""} className="w-auto max-w-[14rem]">
          <option value="">All projects</option>
          {b.projects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </Select>
        <button className="h-10 rounded-xl bg-ink px-4 text-white">Apply</button>
        <Link href="/dashboard" className="h-10 px-2 leading-10 text-muted">Reset</Link>
      </form>
      </details>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Cash in hand" value={inr(cb.cash)} href="/registers/cash" tone={cb.cash < 0 ? "bad" : undefined} />
        <Stat label="Bank balance" value={inr(cb.bank)} href="/registers/bank" />
        <Stat label="To receive (due)" value={inr(totalRec)} sub={`${rec.filter((r) => r.outstanding > 0).length} clients`} href="/registers/clients" tone="warn" />
        <Stat label="To pay" value={inr(totalPay)} sub="vendors + labour" href="/registers/vendors" />
        <Stat label={`Income · ${label}`} value={inr(p.income)} tone="good" />
        <Stat label={`Expenses · ${label}`} value={inr(p.expense)} tone="bad" />
        <Stat label="Net profit" value={inr(p.net)} sub={p.income ? `${p.margin}% margin` : undefined} tone={p.net >= 0 ? "good" : "bad"} href="/reports?type=pl" />
        {b.company.gstin ? <Stat label="GST payable" value={inr(gst.net)} sub={`Out ${inr(gst.output)} − In ${inr(gst.input)}`} href="/registers/gst" /> : <Stat label="Pending review" value={String(b.pending.length)} href="/registers/review" />}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Income vs expense — last 12 months"><IncomeExpenseChart data={monthly} /></Section>
        <Section title="Cash-flow trend"><CashflowChart data={flow} color={b.company.brand_color} /></Section>
        <Section title={`Where money went · ${label}`} action={<Link href="/reports?type=pl" className="text-xs text-brand">P&L →</Link>}>
          {expenseCats.length ? <HBarChart data={expenseCats} color="#dc2626" /> : <p className="text-sm text-muted">No expenses in this period.</p>}
        </Section>
        <Section title="Project profitability (expected margin)" action={<Link href="/projects" className="text-xs text-brand">All →</Link>}>
          {projects.length ? <HBarChart data={projects.slice(0, 8).map((x) => ({ name: x.project.name.slice(0, 22), value: x.expectedProfit, color: HEALTH[x.health] }))} /> : <p className="text-sm text-muted">No projects yet.</p>}
          <div className="mt-2 flex gap-3 text-xs text-muted"><span>● <span style={{ color: HEALTH.green }}>≥20%</span></span><span>● <span style={{ color: HEALTH.amber }}>5–20%</span></span><span>● <span style={{ color: HEALTH.red }}>&lt;5%</span></span></div>
        </Section>
        <Section title="Receivable ageing"><HBarChart data={ageing} height={130} /></Section>

        <Section title="Top pending client payments" action={<Link href="/registers/clients" className="text-xs text-brand">All →</Link>}>
          <ul className="divide-y divide-line text-sm">
            {rec.filter((r) => r.outstanding > 0).slice(0, 5).map((r) => (
              <li key={r.client_id} className="flex items-center justify-between py-2">
                <Link href={`/parties/${r.client_id}`} className="min-w-0"><div className="truncate font-medium">{r.party?.name}</div><div className="text-xs text-muted">{r.oldestDays} days oldest</div></Link>
                <Money v={r.outstanding} className="font-semibold text-warn" />
              </li>
            ))}
            {!rec.some((r) => r.outstanding > 0) && <li className="py-2 text-muted">Nobody owes you right now.</li>}
          </ul>
        </Section>
        <Section title="Upcoming vendor dues">
          <ul className="divide-y divide-line text-sm">
            {vendorDues.map((d, i) => (
              <li key={i} className="flex items-center justify-between py-2">
                <div className="min-w-0"><div className="truncate font-medium">{d.party.name}</div><div className="text-xs text-muted">{d.label} · due {dmy(d.due)}</div></div>
                <div className="text-right"><Money v={d.outstanding} />{d.overdue && <div><Badge tone="bad">Overdue</Badge></div>}</div>
              </li>
            ))}
            {!vendorDues.length && <li className="py-2 text-muted">No bills with due dates.</li>}
          </ul>
        </Section>
        <Section title="Latest entries" action={<Link href="/transactions" className="text-xs text-brand">All →</Link>}>
          <ul className="divide-y divide-line text-sm">
            {latest.map((t) => (
              <li key={t.id}><Link href={`/transactions/${t.id}`} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0"><div className="truncate">{describe(t, ix)}</div><div className="text-xs text-muted">{dmy(t.txn_date)} · {t.mode ?? t.entry_type.replace("_", " ")}</div></div>
                <Money v={t.amount} signed={t.entry_type === "money" ? t.direction : undefined} />
              </Link></li>
            ))}
          </ul>
        </Section>
        <Section title={`Pending review (${b.pending.length})`} action={<Link href="/registers/review" className="text-xs text-brand">Review →</Link>}>
          <ul className="divide-y divide-line text-sm">
            {b.pending.slice(0, 5).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0"><div className="truncate">{t.notes || describe(t, ix)}</div><div className="text-xs text-muted">{dmy(t.txn_date)} {t.is_approximate && "· approx"}</div></div>
                <Money v={t.amount} />
              </li>
            ))}
            {!b.pending.length && <li className="py-2 text-muted">All clear.</li>}
          </ul>
        </Section>
      </div>
      <Card className="p-3 text-xs text-muted">Totals use confirmed entries only. Profit is on a cash basis (money actually received and paid); transfers, owner drawings, capital and loans are excluded.</Card>
    </div>
  );
}
