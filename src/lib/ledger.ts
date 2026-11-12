// Pure accounting computations over a Book. Every screen, report, alert and
// chat answer uses these same functions, so the numbers always agree.
import type { Book } from "./db";
import type { Account, Category, Party, Project, Txn } from "./types";
import { addDays, daysBetween, fyOf, fyRange, monthKey, round2, todayISO } from "./format";

export const TDS_194C = { single: 30000, aggregate: 100000 };

export function indexBook(b: Book) {
  const cat = new Map(b.categories.map((c) => [c.id, c]));
  const party = new Map(b.parties.map((p) => [p.id, p]));
  const project = new Map(b.projects.map((p) => [p.id, p]));
  const account = new Map(b.accounts.map((a) => [a.id, a]));
  return { cat, party, project, account };
}
export type Index = ReturnType<typeof indexBook>;

const inRange = (d: string, from?: string, to?: string) => (!from || d >= from) && (!to || d <= to);

/** Does this entry count as income/expense in P&L? (cash basis: money entries only) */
export function isPL(t: Txn, ix: Index): boolean {
  if (t.entry_type !== "money") return false;
  const c = t.category_id ? ix.cat.get(t.category_id) : undefined;
  if (c && (!c.counts_in_pl || c.is_transfer)) return false;
  return true;
}

export function groupOf(t: Txn, ix: Index): string {
  const c = t.category_id ? ix.cat.get(t.category_id) : undefined;
  return c?.group_name ?? (t.direction === "in" ? "Income" : "Uncategorised");
}
export function catName(t: Txn, ix: Index): string {
  const c = t.category_id ? ix.cat.get(t.category_id) : undefined;
  return c?.name ?? "Uncategorised";
}

// ---------------- Balances ----------------
export function accountBalances(b: Book, upto?: string) {
  const bal = new Map<string, number>(b.accounts.map((a) => [a.id, a.opening_balance]));
  for (const t of b.txns) {
    if (t.entry_type !== "money" || !t.account_id) continue;
    if (upto && t.txn_date > upto) continue;
    bal.set(t.account_id, (bal.get(t.account_id) ?? 0) + (t.direction === "in" ? t.amount : -t.amount));
  }
  return b.accounts.map((a) => ({ account: a, balance: round2(bal.get(a.id) ?? 0) }));
}

export function cashAndBank(b: Book, upto?: string) {
  const rows = accountBalances(b, upto);
  const cash = rows.filter((r) => r.account.type === "cash").reduce((s, r) => s + r.balance, 0);
  const bank = rows.filter((r) => r.account.type !== "cash").reduce((s, r) => s + r.balance, 0);
  return { cash: round2(cash), bank: round2(bank), rows };
}

// ---------------- P&L ----------------
export function pnl(b: Book, from?: string, to?: string, projectId?: string) {
  const ix = indexBook(b);
  const byGroup = new Map<string, number>();
  const byCat = new Map<string, { group: string; amount: number; direction: "in" | "out" }>();
  let income = 0, expense = 0;
  for (const t of b.txns) {
    if (!isPL(t, ix) || !inRange(t.txn_date, from, to)) continue;
    if (projectId && t.project_id !== projectId) continue;
    const g = groupOf(t, ix);
    const c = catName(t, ix);
    const signed = t.direction === "in" ? t.amount : -t.amount;
    if (t.direction === "in") income += t.amount; else expense += t.amount;
    byGroup.set(g, (byGroup.get(g) ?? 0) + Math.abs(signed));
    const k = `${t.direction}|${c}`;
    const cur = byCat.get(k) ?? { group: g, amount: 0, direction: t.direction };
    cur.amount += t.amount;
    byCat.set(k, cur);
  }
  const categories = [...byCat.entries()].map(([k, v]) => ({ name: k.split("|")[1], ...v, amount: round2(v.amount) }))
    .sort((a, b) => b.amount - a.amount);
  return {
    income: round2(income), expense: round2(expense), net: round2(income - expense),
    margin: income ? round2(((income - expense) / income) * 100) : 0,
    byGroup: Object.fromEntries([...byGroup].map(([k, v]) => [k, round2(v)])),
    categories,
  };
}

export function monthlyIncomeExpense(b: Book, months: string[], projectId?: string) {
  const ix = indexBook(b);
  const m = new Map(months.map((k) => [k, { month: k, income: 0, expense: 0 }]));
  for (const t of b.txns) {
    if (!isPL(t, ix)) continue;
    if (projectId && t.project_id !== projectId) continue;
    const row = m.get(monthKey(t.txn_date));
    if (!row) continue;
    if (t.direction === "in") row.income += t.amount; else row.expense += t.amount;
  }
  return [...m.values()].map((r) => ({ ...r, income: round2(r.income), expense: round2(r.expense), profit: round2(r.income - r.expense) }));
}

export function cashflowTrend(b: Book, months: string[]) {
  const out: { month: string; inflow: number; outflow: number; closing: number }[] = [];
  for (const mk of months) {
    const from = `${mk}-01`;
    const to = addDays(monthEnd(mk), 0);
    let inflow = 0, outflow = 0;
    for (const t of b.txns) {
      if (t.entry_type !== "money" || !inRange(t.txn_date, from, to)) continue;
      const ix = t.category_id ? b.categories.find((c) => c.id === t.category_id) : undefined;
      if (ix?.is_transfer) continue;
      if (t.direction === "in") inflow += t.amount; else outflow += t.amount;
    }
    const cb = cashAndBank(b, to);
    out.push({ month: mk, inflow: round2(inflow), outflow: round2(outflow), closing: round2(cb.cash + cb.bank) });
  }
  return out;
}
function monthEnd(mk: string) {
  const d = new Date(`${mk}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

// ---------------- Projects ----------------
export function projectStats(b: Book) {
  const ix = indexBook(b);
  return b.projects.map((p) => {
    const stages = b.stages.filter((s) => s.project_id === p.id);
    const extra = stages.filter((s) => s.is_extra).reduce((s, x) => s + x.amount, 0);
    const contract = p.quoted_value + extra;
    let received = 0, spent = 0;
    const actualByCat = new Map<string, number>();
    const spentByGroup = new Map<string, number>();
    for (const t of b.txns) {
      if (t.project_id !== p.id || !isPL(t, ix)) continue;
      if (t.direction === "in") received += t.amount;
      else {
        spent += t.amount;
        if (t.category_id) actualByCat.set(t.category_id, (actualByCat.get(t.category_id) ?? 0) + t.amount);
        const g = groupOf(t, ix);
        spentByGroup.set(g, (spentByGroup.get(g) ?? 0) + t.amount);
      }
    }
    const budgetTotal = Object.values(p.budget ?? {}).reduce((s, v) => s + Number(v || 0), 0);
    const budgetRows = Object.entries(p.budget ?? {}).map(([catId, amt]) => {
      const actual = actualByCat.get(catId) ?? 0;
      return { category_id: catId, category: ix.cat.get(catId)?.name ?? "—", budget: Number(amt), actual: round2(actual), over: actual > Number(amt) };
    });
    const profit = received - spent;
    const expectedProfit = contract - spent;
    const expectedMargin = contract ? (expectedProfit / contract) * 100 : 0;
    const health: "green" | "amber" | "red" = expectedMargin >= 20 ? "green" : expectedMargin >= 5 ? "amber" : "red";
    return {
      project: p,
      client: p.client_id ? ix.party.get(p.client_id) ?? null : null,
      contract: round2(contract), extra: round2(extra), received: round2(received), spent: round2(spent),
      pendingFromClient: round2(contract - received),
      profit: round2(profit), margin: received ? round2((profit / received) * 100) : 0,
      expectedProfit: round2(expectedProfit), expectedMargin: round2(expectedMargin), health,
      budgetTotal: round2(budgetTotal), budgetRows,
      spentByGroup: Object.fromEntries([...spentByGroup].map(([k, v]) => [k, round2(v)])),
      overrun: (budgetTotal > 0 && spent > budgetTotal) || budgetRows.some((r) => r.over) || (contract > 0 && spent > contract),
      stages,
    };
  });
}

// ---------------- Receivables (clients) ----------------
type DueItem = { label: string; date: string; amount: number; kind: "stage" | "invoice" | "opening" };

export function receivables(b: Book, asOf = todayISO()) {
  const ix = indexBook(b);
  const clientIds = new Set<string>();
  b.parties.filter((p) => p.type === "client").forEach((p) => clientIds.add(p.id));
  b.projects.forEach((p) => p.client_id && clientIds.add(p.client_id));

  const rows = [...clientIds].map((cid) => {
    const party = ix.party.get(cid);
    const projects = b.projects.filter((p) => p.client_id === cid);
    const pids = new Set(projects.map((p) => p.id));
    const dues: DueItem[] = [];
    if (party && party.opening_balance > 0) dues.push({ label: "Opening balance", date: "1900-01-01", amount: party.opening_balance, kind: "opening" });
    for (const s of b.stages) {
      if (!pids.has(s.project_id)) continue;
      const isDue = (s.due_date && s.due_date <= asOf) || s.status !== "pending";
      if (isDue) dues.push({ label: `${ix.project.get(s.project_id)?.name ?? ""} · ${s.name}`, date: s.due_date ?? asOf, amount: s.amount, kind: "stage" });
    }
    for (const inv of b.invoices) {
      if (inv.doc_type !== "invoice" || inv.status === "cancelled" || inv.stage_id) continue;
      if (inv.party_id !== cid && !(inv.project_id && pids.has(inv.project_id))) continue;
      dues.push({ label: `Invoice ${inv.number}`, date: inv.due_date ?? inv.doc_date, amount: inv.total, kind: "invoice" });
    }
    dues.sort((a, b) => a.date.localeCompare(b.date));
    const receipts = b.txns.filter((t) => t.entry_type === "money" && t.direction === "in" &&
      (t.party_id === cid || (!t.party_id && t.project_id && pids.has(t.project_id))) && !isNonTrade(t, ix));
    let pool = receipts.reduce((s, t) => s + t.amount, 0);
    const received = pool;
    const open: (DueItem & { outstanding: number; age: number })[] = [];
    for (const d of dues) {
      const used = Math.min(pool, d.amount);
      pool -= used;
      const outstanding = d.amount - used;
      if (outstanding > 0.5) open.push({ ...d, outstanding: round2(outstanding), age: Math.max(0, daysBetween(d.date === "1900-01-01" ? asOf : d.date, asOf)) });
    }
    const buckets = { "0-30": 0, "31-60": 0, "60+": 0 };
    for (const o of open) {
      if (o.age <= 30) buckets["0-30"] += o.outstanding; else if (o.age <= 60) buckets["31-60"] += o.outstanding; else buckets["60+"] += o.outstanding;
    }
    const totalDue = dues.reduce((s, d) => s + d.amount, 0);
    const contract = projects.reduce((s, p) => s + p.quoted_value, 0) +
      b.stages.filter((s) => pids.has(s.project_id) && s.is_extra).reduce((s, x) => s + x.amount, 0);
    const lastPayment = receipts.length ? receipts[receipts.length - 1].txn_date : null;
    return {
      party: party ?? null, client_id: cid, projects,
      totalDue: round2(totalDue), received: round2(received),
      outstanding: round2(open.reduce((s, o) => s + o.outstanding, 0)),
      advanceHeld: round2(Math.max(0, pool)),
      contractBalance: round2(contract - received),
      buckets: { "0-30": round2(buckets["0-30"]), "31-60": round2(buckets["31-60"]), "60+": round2(buckets["60+"]) },
      oldestDays: open.length ? Math.max(...open.map((o) => o.age)) : 0,
      open, lastPayment,
    };
  });
  return rows.sort((a, b) => b.outstanding - a.outstanding);
}

function isNonTrade(t: Txn, ix: Index) {
  const c = t.category_id ? ix.cat.get(t.category_id) : undefined;
  return !!c && (c.is_transfer || ["Capital introduced", "Loans"].includes(c.name));
}

// ---------------- Payables (vendors + labour) ----------------
export function payables(b: Book, type: "vendor" | "labour", asOf = todayISO()) {
  const ix = indexBook(b);
  const fy = fyOf(asOf, b.company.fy_start_month);
  const { from: fyFrom, to: fyTo } = fyRange(fy, b.company.fy_start_month);
  return b.parties.filter((p) => p.type === type).map((p) => {
    const bills = b.txns.filter((t) => t.party_id === p.id && t.entry_type === (type === "vendor" ? "vendor_bill" : "labour_work"));
    const allPays = b.txns.filter((t) => t.party_id === p.id && t.entry_type === "money" && t.direction === "out");
    // Vendors: only payments marked "pays an earlier bill" reduce the payable (spot purchases are already settled).
    // Labour: every payment counts against work done (so advances show up).
    const pays = type === "vendor" ? allPays.filter((t) => t.settles_bill) : allPays;
    const refunds = b.txns.filter((t) => t.party_id === p.id && t.entry_type === "money" && t.direction === "in");
    const billed = p.opening_balance + bills.reduce((s, t) => s + t.amount, 0);
    const paid = pays.reduce((s, t) => s + t.amount, 0) - refunds.reduce((s, t) => s + t.amount, 0);
    // FIFO against bills with due dates → upcoming/overdue dues
    let pool = paid;
    const dues: { label: string; date: string; due: string | null; outstanding: number; overdue: boolean }[] = [];
    const items = [
      ...(p.opening_balance > 0 ? [{ label: "Opening balance", txn_date: "1900-01-01", amount: p.opening_balance, due_date: null as string | null }] : []),
      ...bills.map((t) => ({ label: t.bill_no ? `Bill ${t.bill_no}` : t.notes ?? "Bill", txn_date: t.txn_date, amount: t.amount, due_date: t.due_date })),
    ].sort((a, b) => a.txn_date.localeCompare(b.txn_date));
    for (const it of items) {
      const used = Math.min(pool, it.amount);
      pool -= used;
      const o = it.amount - used;
      if (o > 0.5) dues.push({ label: it.label, date: it.txn_date, due: it.due_date, outstanding: round2(o), overdue: !!it.due_date && it.due_date < asOf });
    }
    // TDS 194C check on contractor payments in this FY
    const fyPays = allPays.filter((t) => inRange(t.txn_date, fyFrom, fyTo));
    const fyTotal = fyPays.reduce((s, t) => s + t.amount, 0);
    const maxSingle = fyPays.reduce((m, t) => Math.max(m, t.amount), 0);
    const isContractor = type === "labour" || fyPays.some((t) => groupOf(t, ix) === "Project labour");
    const tdsDeducted = fyPays.reduce((s, t) => s + t.tds_amount, 0);
    const tdsFlag = isContractor && (maxSingle > TDS_194C.single || fyTotal > TDS_194C.aggregate);
    return {
      party: p,
      billed: round2(billed), paid: round2(paid),
      balance: round2(billed - paid), // >0 we owe them; <0 advance given
      dues, fyTotal: round2(fyTotal), maxSingle: round2(maxSingle), tdsDeducted: round2(tdsDeducted), tdsFlag,
      lastPayment: allPays.length ? allPays[allPays.length - 1].txn_date : null,
    };
  }).sort((a, b) => b.balance - a.balance);
}

// ---------------- GST ----------------
export function gstSummary(b: Book, from?: string, to?: string) {
  const months = new Map<string, { month: string; outCgst: number; outSgst: number; outIgst: number; output: number; input: number; taxable: number; b2b: number; b2c: number }>();
  const row = (d: string) => {
    const k = monthKey(d);
    if (!months.has(k)) months.set(k, { month: k, outCgst: 0, outSgst: 0, outIgst: 0, output: 0, input: 0, taxable: 0, b2b: 0, b2c: 0 });
    return months.get(k)!;
  };
  const ix = indexBook(b);
  for (const inv of b.invoices) {
    if (inv.doc_type !== "invoice" || inv.status === "cancelled" || !inRange(inv.doc_date, from, to)) continue;
    const r = row(inv.doc_date);
    r.outCgst += inv.cgst; r.outSgst += inv.sgst; r.outIgst += inv.igst;
    r.output += inv.cgst + inv.sgst + inv.igst;
    r.taxable += inv.subtotal;
    const gstin = inv.party_id ? ix.party.get(inv.party_id)?.gstin : null;
    if (gstin) r.b2b += inv.total; else r.b2c += inv.total;
  }
  for (const t of b.txns) {
    if (!t.gst_amount || !inRange(t.txn_date, from, to)) continue;
    const r = row(t.txn_date);
    if (t.direction === "out" && (t.entry_type === "money" || t.entry_type === "vendor_bill")) r.input += t.gst_amount;
    if (t.direction === "in" && t.entry_type === "money" && !t.invoice_id) r.output += t.gst_amount; // GST collected without an invoice in the app
  }
  const list = [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).map((r) => ({
    ...r, outCgst: round2(r.outCgst), outSgst: round2(r.outSgst), outIgst: round2(r.outIgst),
    output: round2(r.output), input: round2(r.input), net: round2(r.output - r.input), taxable: round2(r.taxable), b2b: round2(r.b2b), b2c: round2(r.b2c),
  }));
  const tot = list.reduce((s, r) => ({ output: s.output + r.output, input: s.input + r.input }), { output: 0, input: 0 });
  return { months: list, output: round2(tot.output), input: round2(tot.input), net: round2(tot.output - tot.input) };
}

// ---------------- Registers ----------------
export function withRunningBalance(rows: Txn[], opening: number) {
  let bal = opening;
  return rows.map((t) => {
    bal += t.direction === "in" ? t.amount : -t.amount;
    return { t, balance: round2(bal) };
  });
}

export function accountRegister(b: Book, accountIds: string[], from?: string, to?: string) {
  const set = new Set(accountIds);
  const opening = b.accounts.filter((a) => set.has(a.id)).reduce((s, a) => s + a.opening_balance, 0)
    + b.txns.filter((t) => t.entry_type === "money" && t.account_id && set.has(t.account_id) && from && t.txn_date < from)
      .reduce((s, t) => s + (t.direction === "in" ? t.amount : -t.amount), 0);
  const rows = b.txns.filter((t) => t.entry_type === "money" && t.account_id && set.has(t.account_id) && inRange(t.txn_date, from, to));
  return { opening: round2(opening), rows: withRunningBalance(rows, opening) };
}

export function dailyClosing(entries: { t: Txn; balance: number }[]) {
  const m = new Map<string, { date: string; in: number; out: number; closing: number }>();
  for (const e of entries) {
    const r = m.get(e.t.txn_date) ?? { date: e.t.txn_date, in: 0, out: 0, closing: 0 };
    if (e.t.direction === "in") r.in += e.t.amount; else r.out += e.t.amount;
    r.closing = e.balance;
    m.set(e.t.txn_date, r);
  }
  return [...m.values()];
}

// ---------------- Alerts ----------------
export type Alert = { level: "high" | "medium" | "low"; kind: string; title: string; detail: string; href?: string; whatsapp?: string };

export function alerts(b: Book, asOf = todayISO()): Alert[] {
  const ix = indexBook(b);
  const out: Alert[] = [];
  for (const r of receivables(b, asOf)) {
    const overdue = r.open.filter((o) => o.age > 0 && o.kind !== "opening");
    const amt = overdue.reduce((s, o) => s + o.outstanding, 0) + r.open.filter((o) => o.kind === "opening").reduce((s, o) => s + o.outstanding, 0);
    if (amt > 0 && r.party) {
      const msg = `Namaste ${r.party.name} ji, this is a gentle reminder from ${b.company.name}. ₹${Math.round(amt).toLocaleString("en-IN")} is pending${r.projects[0] ? ` for ${r.projects[0].name}` : ""} (${overdue.map((o) => o.label.split(" · ").pop()).join(", ") || "previous balance"}).${b.company.upi_id ? ` You can pay via UPI: ${b.company.upi_id}.` : ""} Thank you!`;
      const phone = (r.party.phone ?? "").replace(/\D/g, "");
      out.push({
        level: r.oldestDays > 30 ? "high" : "medium", kind: "client_overdue",
        title: `${r.party.name} owes ₹${Math.round(amt).toLocaleString("en-IN")}`,
        detail: `Oldest due ${r.oldestDays} days`, href: `/parties/${r.client_id}`,
        whatsapp: `https://wa.me/${phone.length === 10 ? "91" + phone : phone}?text=${encodeURIComponent(msg)}`,
      });
    }
  }
  for (const type of ["vendor", "labour"] as const) {
    for (const p of payables(b, type, asOf)) {
      const soon = p.dues.filter((d) => d.due && d.due <= addDays(asOf, 7));
      if (soon.length) {
        const amt = soon.reduce((s, d) => s + d.outstanding, 0);
        out.push({ level: soon.some((d) => d.overdue) ? "high" : "medium", kind: "vendor_due", title: `Pay ${p.party.name} ₹${Math.round(amt).toLocaleString("en-IN")}`, detail: soon.some((d) => d.overdue) ? "Overdue" : "Due within 7 days", href: `/parties/${p.party.id}` });
      }
      if (p.tdsFlag && p.tdsDeducted === 0) {
        out.push({ level: "medium", kind: "tds", title: `TDS 194C may apply: ${p.party.name}`, detail: `Paid ₹${Math.round(p.fyTotal).toLocaleString("en-IN")} this FY (largest single ₹${Math.round(p.maxSingle).toLocaleString("en-IN")}). Limits: ₹30,000 single / ₹1,00,000 a year. Check with your CA.`, href: `/parties/${p.party.id}` });
      }
    }
  }
  for (const ps of projectStats(b)) {
    if (ps.overrun && ps.project.status !== "cancelled") {
      const over = ps.budgetRows.filter((r) => r.over).map((r) => r.category);
      out.push({ level: "high", kind: "overrun", title: `Budget overrun: ${ps.project.name}`, detail: over.length ? `Over budget on ${over.join(", ")}` : `Spent ₹${Math.round(ps.spent).toLocaleString("en-IN")}`, href: `/projects/${ps.project.id}` });
    }
  }
  const since = addDays(asOf, -30);
  const noBill = b.txns.filter((t) => t.entry_type === "money" && t.direction === "out" && t.mode === "cash" && t.amount >= 2000 && t.attachments.length === 0 && t.txn_date >= since && isPL(t, ix));
  if (noBill.length) out.push({ level: "low", kind: "no_bill", title: `${noBill.length} cash payments without a bill photo`, detail: `₹${Math.round(noBill.reduce((s, t) => s + t.amount, 0)).toLocaleString("en-IN")} in the last 30 days`, href: "/transactions?nobill=1" });
  const dups = findDuplicates(b.txns);
  if (dups.length) out.push({ level: "medium", kind: "duplicate", title: `${dups.length} possible duplicate entries`, detail: "Same amount, party and direction within 2 days", href: "/transactions?dups=1" });
  if (b.pending.length) out.push({ level: "medium", kind: "review", title: `${b.pending.length} entries waiting for review`, detail: "AI drafts and approximate entries", href: "/registers/review" });
  const order = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

export function findDuplicates(txns: Txn[]): [Txn, Txn][] {
  const out: [Txn, Txn][] = [];
  const sorted = [...txns].sort((a, b) => a.txn_date.localeCompare(b.txn_date));
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i], c = sorted[j];
      if (daysBetween(a.txn_date, c.txn_date) > 2) break;
      if (a.amount === c.amount && a.direction === c.direction && a.entry_type === c.entry_type &&
          (a.party_id ?? "") === (c.party_id ?? "") && !a.transfer_group && !c.transfer_group) out.push([a, c]);
    }
  }
  return out;
}

// ---------------- Helpers for UI ----------------
export function describe(t: Txn, ix: Index): string {
  const party = t.party_id ? ix.party.get(t.party_id)?.name : null;
  const proj = t.project_id ? ix.project.get(t.project_id)?.name : null;
  return [catName(t, ix), party, proj].filter(Boolean).join(" · ");
}

export function filterTxns(b: Book, f: { from?: string; to?: string; project?: string; party?: string; category?: string; q?: string }) {
  const ix = indexBook(b);
  return b.txns.filter((t) => inRange(t.txn_date, f.from, f.to)
    && (!f.project || t.project_id === f.project)
    && (!f.party || t.party_id === f.party)
    && (!f.category || t.category_id === f.category)
    && (!f.q || `${describe(t, ix)} ${t.notes ?? ""} ${t.bill_no ?? ""} ${t.reference ?? ""}`.toLowerCase().includes(f.q.toLowerCase())));
}

export type { Account, Category, Party, Project };

// ---------------- Party ledger statement ----------------
export type StatementRow = { date: string; particulars: string; debit: number; credit: number; balance: number; txn_id?: string };

/**
 * Client:  debit = amount that became due (stages/invoices), credit = payment received. Balance > 0 → client owes us.
 * Vendor/labour: credit = bills / work done, debit = payments. Balance > 0 → we owe them.
 */
export function partyStatement(b: Book, partyId: string, asOf = todayISO()): { rows: StatementRow[]; balance: number; kind: "client" | "supplier" } {
  const ix = indexBook(b);
  const p = ix.party.get(partyId);
  const isClient = p?.type === "client" || b.projects.some((x) => x.client_id === partyId);
  const raw: Omit<StatementRow, "balance">[] = [];
  if (p && p.opening_balance) raw.push({ date: "1900-01-01", particulars: "Opening balance", debit: isClient ? p.opening_balance : 0, credit: isClient ? 0 : p.opening_balance });
  if (isClient) {
    const pids = new Set(b.projects.filter((x) => x.client_id === partyId).map((x) => x.id));
    for (const s of b.stages) {
      if (!pids.has(s.project_id)) continue;
      if ((s.due_date && s.due_date <= asOf) || s.status !== "pending")
        raw.push({ date: s.due_date ?? asOf, particulars: `${ix.project.get(s.project_id)?.name} — ${s.name}`, debit: s.amount, credit: 0 });
    }
    for (const inv of b.invoices) {
      if (inv.doc_type !== "invoice" || inv.status === "cancelled" || inv.stage_id) continue;
      if (inv.party_id === partyId || (inv.project_id && pids.has(inv.project_id)))
        raw.push({ date: inv.doc_date, particulars: `Invoice ${inv.number}`, debit: inv.total, credit: 0 });
    }
    for (const t of b.txns) {
      if (t.entry_type !== "money") continue;
      if (!(t.party_id === partyId || (!t.party_id && t.project_id && pids.has(t.project_id)))) continue;
      if (t.direction === "in") raw.push({ date: t.txn_date, particulars: `Received (${t.mode}) ${t.notes ?? ""}`.trim(), debit: 0, credit: t.amount, txn_id: t.id });
      else raw.push({ date: t.txn_date, particulars: `Refund / paid (${t.mode}) ${t.notes ?? ""}`.trim(), debit: t.amount, credit: 0, txn_id: t.id });
    }
  } else {
    for (const t of b.txns) {
      if (t.party_id !== partyId) continue;
      const label = `${catName(t, ix)}${t.project_id ? ` · ${ix.project.get(t.project_id)?.name}` : ""}${t.bill_no ? ` · Bill ${t.bill_no}` : ""}`;
      if (t.entry_type !== "money") raw.push({ date: t.txn_date, particulars: t.entry_type === "vendor_bill" ? `Bill — ${label}` : `Work done — ${t.notes ?? label}`, debit: 0, credit: t.amount, txn_id: t.id });
      else if (t.direction === "out") {
        if (p?.type === "vendor" && !t.settles_bill) raw.push({ date: t.txn_date, particulars: `Purchase paid on the spot (${t.mode}) — ${label}`, debit: t.amount, credit: t.amount, txn_id: t.id });
        else raw.push({ date: t.txn_date, particulars: `Paid (${t.mode}) — ${t.notes ?? label}`, debit: t.amount, credit: 0, txn_id: t.id });
      } else raw.push({ date: t.txn_date, particulars: `Received back (${t.mode})`, debit: 0, credit: t.amount, txn_id: t.id });
    }
  }
  raw.sort((a, c) => a.date.localeCompare(c.date));
  let bal = 0;
  const rows = raw.map((r) => {
    bal += isClient ? r.debit - r.credit : r.credit - r.debit;
    return { ...r, balance: round2(bal) };
  });
  return { rows, balance: round2(bal), kind: isClient ? "client" : "supplier" };
}
