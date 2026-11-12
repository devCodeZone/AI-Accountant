// Shared (client + server) helpers for bank statement and Excel ledger imports.

const MON: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

/** Accepts DD-MM-YYYY, DD/MM/YY, DD-MMM-YYYY, YYYY-MM-DD, Excel serials, Date objects. Indian day-first by default. */
export function parseDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    const d = new Date(v.getTime() - v.getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 10);
  }
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2,4})/);
  if (m) return iso(year(+m[3]), +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[-/ ]([A-Za-z]{3,4})[a-z]*[-/ ,]+(\d{2,4})/);
  if (m && MON[m[2].toLowerCase()]) return iso(year(+m[3]), MON[m[2].toLowerCase()], +m[1]);
  m = s.match(/^([A-Za-z]{3,4})[a-z]*[ -](\d{1,2}),? (\d{4})/);
  if (m && MON[m[1].toLowerCase()]) return iso(+m[3], MON[m[1].toLowerCase()], +m[2]);
  return null;
}
const year = (y: number) => (y < 100 ? 2000 + y : y);
function iso(y: number, mo: number, d: number) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "1,20,000.00 Cr" → 120000 ; "(500)" → -500 */
export function parseAmount(v: unknown): number {
  if (typeof v === "number") return v;
  if (v == null) return 0;
  let s = String(v).trim();
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s);
  s = s.replace(/[₹,\s]|INR|Rs\.?|Dr|Cr|\(|\)/gi, "").replace(/^-/, "");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : neg ? -n : n;
}

export type BankMap = { date: number; narration: number; debit: number; credit: number; amount: number; type: number; reference: number; balance: number };
export type LedgerMap = { date: number; amount: number; debit: number; credit: number; direction: number; mode: number; party: number; project: number; category: number; notes: number; bill_no: number };

const find = (headers: string[], words: RegExp) => headers.findIndex((h) => words.test(h.toLowerCase()));

export function guessBankMap(h: string[]): BankMap {
  return {
    date: find(h, /^(txn |transaction |value )?date|^date/),
    narration: find(h, /narration|description|particular|remark|details/),
    debit: find(h, /withdrawal|debit|dr\b|paid out/),
    credit: find(h, /deposit|credit|cr\b|paid in/),
    amount: find(h, /^amount|amount \(inr\)|txn amount/),
    type: find(h, /^(dr\/cr|cr\/dr|type)$/),
    reference: find(h, /ref|chq|cheque|utr/),
    balance: find(h, /balance/),
  };
}

export function guessLedgerMap(h: string[]): LedgerMap {
  return {
    date: find(h, /date/),
    amount: find(h, /^amount|^amt|rupees|^rs/),
    debit: find(h, /paid|debit|out|expense|payment/),
    credit: find(h, /received|credit|\bin\b|income|receipt/),
    direction: find(h, /type|in\/out|direction/),
    mode: find(h, /mode|cash\/bank|method/),
    party: find(h, /party|name|vendor|client|paid to|received from|person/),
    project: find(h, /project|site/),
    category: find(h, /category|head|account|purpose/),
    notes: find(h, /note|remark|narration|description|detail/),
    bill_no: find(h, /bill|invoice|voucher/),
  };
}

/** Find the header row in a messy sheet (first row with ≥3 non-empty cells incl. something date-like). */
export function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const cells = rows[i].map((c) => String(c ?? "").toLowerCase());
    if (cells.filter(Boolean).length >= 3 && cells.some((c) => c.includes("date"))) return i;
  }
  return 0;
}

export type BankLine = { date: string; narration: string; amount: number; direction: "in" | "out"; reference: string | null };

export function bankLines(rows: unknown[][], map: BankMap): BankLine[] {
  const out: BankLine[] = [];
  for (const r of rows) {
    const date = parseDate(r[map.date]);
    if (!date) continue;
    let amount = 0, direction: "in" | "out" = "out";
    const dr = map.debit >= 0 ? Math.abs(parseAmount(r[map.debit])) : 0;
    const cr = map.credit >= 0 ? Math.abs(parseAmount(r[map.credit])) : 0;
    if (dr || cr) { amount = dr || cr; direction = cr && !dr ? "in" : "out"; }
    else if (map.amount >= 0) {
      const a = parseAmount(r[map.amount]);
      const t = map.type >= 0 ? String(r[map.type] ?? "").toLowerCase() : "";
      amount = Math.abs(a);
      direction = t.startsWith("cr") || t.includes("credit") || (!t && a > 0 && /cr/i.test(String(r[map.amount]))) ? "in" : t ? "out" : a < 0 ? "out" : "in";
    }
    if (!(amount > 0)) continue;
    out.push({ date, narration: String(r[map.narration] ?? "").trim().slice(0, 300), amount: Math.round(amount * 100) / 100, direction, reference: map.reference >= 0 ? String(r[map.reference] ?? "").trim() || null : null });
  }
  return out;
}
