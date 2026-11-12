import type { Book } from "./db";
import { accountRegister, catName, gstSummary, groupOf, indexBook, isPL, payables, pnl, projectStats, receivables } from "./ledger";
import { dmy, monthKey, monthLabel, round2 } from "./format";

export function plReport(b: Book, from: string, to: string) {
  const p = pnl(b, from, to);
  const groups = ["Income", "Project materials", "Project labour", "Site expenses", "Overheads", "Uncategorised"];
  const sections = groups.map((g) => ({
    group: g,
    rows: p.categories.filter((c) => c.group === g || (g === "Uncategorised" && c.group === "Uncategorised")).map((c) => ({ name: c.name, amount: c.amount })),
  })).filter((s) => s.rows.length);
  const direct = ["Project materials", "Project labour", "Site expenses"].reduce((s, g) => s + (p.byGroup[g] ?? 0), 0);
  const gross = p.income - direct;
  return { ...p, sections, direct: round2(direct), gross: round2(gross), overheads: round2(p.byGroup["Overheads"] ?? 0) };
}

export function cashflowReport(b: Book, from: string, to: string) {
  const m = new Map<string, { month: string; cashIn: number; cashOut: number; bankIn: number; bankOut: number }>();
  const acc = new Map(b.accounts.map((a) => [a.id, a]));
  const ix = indexBook(b);
  for (const t of b.txns) {
    if (t.entry_type !== "money" || t.txn_date < from || t.txn_date > to || !t.account_id) continue;
    const k = monthKey(t.txn_date);
    const r = m.get(k) ?? { month: k, cashIn: 0, cashOut: 0, bankIn: 0, bankOut: 0 };
    const cash = acc.get(t.account_id)?.type === "cash";
    if (t.direction === "in") cash ? (r.cashIn += t.amount) : (r.bankIn += t.amount);
    else cash ? (r.cashOut += t.amount) : (r.bankOut += t.amount);
    m.set(k, r);
  }
  const rows = [...m.values()].sort((a, c) => a.month.localeCompare(c.month)).map((r) => ({ ...r, net: round2(r.cashIn + r.bankIn - r.cashOut - r.bankOut) }));
  const operating = b.txns.filter((t) => isPL(t, ix) && t.txn_date >= from && t.txn_date <= to).reduce((s, t) => s + (t.direction === "in" ? t.amount : -t.amount), 0);
  const nonOp = new Map<string, number>();
  for (const t of b.txns) {
    if (t.entry_type !== "money" || isPL(t, ix) || t.txn_date < from || t.txn_date > to) continue;
    const c = t.category_id ? ix.cat.get(t.category_id) : undefined;
    if (c?.is_transfer) continue;
    nonOp.set(catName(t, ix), (nonOp.get(catName(t, ix)) ?? 0) + (t.direction === "in" ? t.amount : -t.amount));
  }
  return { rows, operating: round2(operating), nonOperating: [...nonOp].map(([name, amount]) => ({ name, amount: round2(amount) })) };
}

export function tdsReport(b: Book, from: string, to: string) {
  const ix = indexBook(b);
  const by = new Map<string, { party: string; pan: string | null; paid: number; tds: number; payments: number; maxSingle: number }>();
  for (const t of b.txns) {
    if (t.entry_type !== "money" || t.direction !== "out" || !t.party_id || t.txn_date < from || t.txn_date > to) continue;
    const p = ix.party.get(t.party_id);
    if (!p || !(p.type === "labour" || groupOf(t, ix) === "Project labour" || t.tds_amount > 0)) continue;
    const r = by.get(p.id) ?? { party: p.name, pan: p.pan, paid: 0, tds: 0, payments: 0, maxSingle: 0 };
    r.paid += t.amount; r.tds += t.tds_amount; r.payments++; r.maxSingle = Math.max(r.maxSingle, t.amount);
    by.set(p.id, r);
  }
  return [...by.values()].map((r) => ({ ...r, flag: r.maxSingle > 30000 || r.paid > 100000 })).sort((a, c) => c.paid - a.paid);
}

export function dayBook(b: Book, from: string, to: string) {
  const ix = indexBook(b);
  return b.txns.filter((t) => t.txn_date >= from && t.txn_date <= to).map((t) => ({
    t, date: t.txn_date, type: voucherType(b, t), category: catName(t, ix), party: t.party_id ? ix.party.get(t.party_id)?.name ?? "" : "",
    project: t.project_id ? ix.project.get(t.project_id)?.name ?? "" : "", account: t.account_id ? ix.account.get(t.account_id)?.name ?? "" : "",
  }));
}

export function voucherType(b: Book, t: Book["txns"][number]) {
  if (t.entry_type === "vendor_bill") return "Purchase";
  if (t.entry_type === "labour_work") return "Journal";
  if (t.transfer_group) return "Contra";
  return t.direction === "in" ? "Receipt" : "Payment";
}

/** Sheets for the Excel export — one per register, all built from the same ledger functions. */
export function workbookSheets(b: Book, from: string, to: string): Record<string, (string | number)[][]> {
  const ix = indexBook(b);
  const money = (t: Book["txns"][number]) => [t.direction === "in" ? t.amount : "", t.direction === "out" ? t.amount : ""];
  const reg = (types: string[]) => {
    const ids = b.accounts.filter((a) => types.includes(a.type)).map((a) => a.id);
    const r = accountRegister(b, ids, from, to);
    return [["Date", "Account", "Category", "Party", "Project", "Mode", "Notes", "Reference", "In", "Out", "Balance", "Reconciled"],
      ["", "", "Opening balance", "", "", "", "", "", "", "", r.opening, ""],
      ...r.rows.map(({ t, balance }) => [dmy(t.txn_date), ix.account.get(t.account_id!)?.name ?? "", catName(t, ix), t.party_id ? ix.party.get(t.party_id)?.name ?? "" : "", t.project_id ? ix.project.get(t.project_id)?.name ?? "" : "", t.mode ?? "", t.notes ?? "", t.reference ?? "", ...money(t), balance, t.reconciled ? "Yes" : ""])];
  };
  const p = plReport(b, from, to);
  const g = gstSummary(b, from, to);
  return {
    "P&L": [["Profit & Loss (cash basis)", `${dmy(from)} to ${dmy(to)}`], [], ...p.sections.flatMap((s) => [[s.group, ""], ...s.rows.map((r) => [`  ${r.name}`, r.amount]), []]),
      ["Total income", p.income], ["Direct project costs", p.direct], ["Gross profit", p.gross], ["Overheads", p.overheads], ["Net profit", p.net]],
    "Cash Book": reg(["cash"]),
    "Bank & UPI Book": reg(["bank", "upi", "card"]),
    "Client Payments": [["Client", "Projects", "Received", "Due now", "0-30", "31-60", "60+", "Left on contract"],
      ...receivables(b).map((r) => [r.party?.name ?? "", r.projects.map((x) => x.name).join(", "), r.received, r.outstanding, r.buckets["0-30"], r.buckets["31-60"], r.buckets["60+"], r.contractBalance])],
    "Expenses": [["Date", "Category", "Party", "Mode", "Amount", "GST", "Notes"],
      ...b.txns.filter((t) => t.entry_type === "money" && t.direction === "out" && groupOf(t, ix) === "Overheads" && t.txn_date >= from && t.txn_date <= to)
        .map((t) => [dmy(t.txn_date), catName(t, ix), t.party_id ? ix.party.get(t.party_id)?.name ?? "" : "", t.mode ?? "", t.amount, t.gst_amount, t.notes ?? ""])],
    "Projects": [["Project", "Client", "Status", "Contract", "Received", "Spent", "Profit (cash)", "Expected profit", "Expected margin %", "To collect"],
      ...projectStats(b).map((x) => [x.project.name, x.client?.name ?? "", x.project.status, x.contract, x.received, x.spent, x.profit, x.expectedProfit, x.expectedMargin, x.pendingFromClient])],
    "Vendors": [["Vendor", "GSTIN", "Credit bills", "Paid against bills", "Outstanding", "Paid this FY"],
      ...payables(b, "vendor").map((v) => [v.party.name, v.party.gstin ?? "", v.billed, v.paid, v.balance, v.fyTotal])],
    "Labour": [["Name", "Trade", "Work done", "Paid", "Balance (+ we owe / − advance)", "Paid this FY", "TDS deducted", "194C flag"],
      ...payables(b, "labour").map((v) => [v.party.name, v.party.trade ?? "", v.billed, v.paid, v.balance, v.fyTotal, v.tdsDeducted, v.tdsFlag ? "Check TDS" : ""])],
    "GST": [["Month", "Taxable", "B2B", "B2C", "CGST", "SGST", "IGST", "Output", "Input (ITC)", "Net payable"],
      ...g.months.map((m) => [monthLabel(m.month), m.taxable, m.b2b, m.b2c, m.outCgst, m.outSgst, m.outIgst, m.output, m.input, m.net])],
    "Day Book": [["Date", "Voucher", "Type", "Category", "Party", "Project", "Account", "Mode", "In", "Out", "GST", "TDS", "Bill no", "Notes", "Source"],
      ...dayBook(b, from, to).map((r) => [dmy(r.date), r.type, r.t.entry_type, r.category, r.party, r.project, r.account, r.t.mode ?? "", ...money(r.t), r.t.gst_amount, r.t.tds_amount, r.t.bill_no ?? "", r.t.notes ?? "", r.t.source])],
  };
}

/** Tally-friendly CSV (one line per voucher). Your CA can map ledgers on import. */
export function tallyCsv(b: Book, from: string, to: string): string {
  const ix = indexBook(b);
  const esc = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [["Date", "Voucher Type", "Voucher No", "Party Ledger", "Expense/Income Ledger", "Cash/Bank Ledger", "Amount", "Dr/Cr (party/expense side)", "GST Amount", "TDS Amount", "Bill No", "Narration"].join(",")];
  for (const t of b.txns) {
    if (t.txn_date < from || t.txn_date > to) continue;
    if (t.transfer_group && t.direction === "in") continue; // one Contra line per transfer
    const vt = voucherType(b, t);
    const party = t.party_id ? ix.party.get(t.party_id)?.name ?? "" : "";
    const acct = t.account_id ? ix.account.get(t.account_id)?.name ?? "" : "";
    let ledger = catName(t, ix);
    if (vt === "Contra") {
      const other = b.txns.find((x) => x.transfer_group === t.transfer_group && x.id !== t.id);
      ledger = other?.account_id ? ix.account.get(other.account_id)?.name ?? "" : "";
    }
    const drcr = vt === "Receipt" ? "Cr" : "Dr";
    lines.push([dmy(t.txn_date), vt, t.id.slice(0, 8), party, ledger, acct, t.amount.toFixed(2), drcr, t.gst_amount.toFixed(2), t.tds_amount.toFixed(2), t.bill_no ?? "", [t.notes, t.reference].filter(Boolean).join(" | ")].map(esc).join(","));
  }
  return lines.join("\n");
}
