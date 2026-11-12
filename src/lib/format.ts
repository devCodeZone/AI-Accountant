// Indian formatting helpers: ₹1,20,000 and DD-MM-YYYY

const inr0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

export function inr(v: number | string | null | undefined, decimals = false): string {
  const n = Number(v ?? 0);
  if (!isFinite(n)) return "₹0";
  return decimals ? inr2.format(n) : inr0.format(Math.round(n));
}

/** Compact: ₹1.2L, ₹3.4Cr — for charts/tiles */
export function inrShort(v: number): string {
  const n = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (n >= 1e7) return `${sign}₹${(n / 1e7).toFixed(n >= 1e8 ? 0 : 1)}Cr`;
  if (n >= 1e5) return `${sign}₹${(n / 1e5).toFixed(n >= 1e6 ? 0 : 1)}L`;
  if (n >= 1e3) return `${sign}₹${(n / 1e3).toFixed(0)}k`;
  return `${sign}₹${Math.round(n)}`;
}

export function fmtNum(v: number) {
  return num.format(v);
}

/** 'YYYY-MM-DD' → 'DD-MM-YYYY' */
export function dmy(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}-${m}-${y}`;
}

export function todayISO(): string {
  // India time
  const now = new Date(Date.now() + 5.5 * 3600 * 1000);
  return now.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / 86400000);
}

export function monthKey(iso: string) {
  return iso.slice(0, 7);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return `${MONTHS[Number(m) - 1]} ${y.slice(2)}`;
}

/** Financial year containing a date, e.g. '2026-27' for Oct 2026 with April start */
export function fyOf(iso: string, startMonth = 4): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const start = m >= startMonth ? y : y - 1;
  return startMonth === 1 ? `${start}` : `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export function fyRange(fy: string, startMonth = 4): { from: string; to: string } {
  const start = Number(fy.slice(0, 4));
  const from = `${start}-${String(startMonth).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(start + 1, startMonth - 1, 1));
  endDate.setUTCDate(0);
  return { from, to: endDate.toISOString().slice(0, 10) };
}

export function monthRange(iso: string) {
  const from = iso.slice(0, 7) + "-01";
  const d = new Date(from + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return { from, to: d.toISOString().slice(0, 10) };
}

export function lastNMonths(n: number, endIso = todayISO()): string[] {
  const out: string[] = [];
  const d = new Date(endIso.slice(0, 7) + "-01T00:00:00Z");
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d);
    x.setUTCMonth(x.getUTCMonth() - i);
    out.push(x.toISOString().slice(0, 7));
  }
  return out;
}

// ---------- Amount in words (Indian system) ----------
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? " " + ONES[n % 10] : ""}`;
}
function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", r ? twoDigits(r) : ""].filter(Boolean).join(" ");
}

export function amountInWords(amount: number): string {
  const rupees = Math.floor(Math.abs(amount));
  const paise = Math.round((Math.abs(amount) - rupees) * 100);
  if (rupees === 0 && paise === 0) return "Rupees Zero Only";
  const crore = Math.floor(rupees / 1e7);
  const lakh = Math.floor((rupees % 1e7) / 1e5);
  const thousand = Math.floor((rupees % 1e5) / 1e3);
  const rest = rupees % 1000;
  const parts: string[] = [];
  if (crore) parts.push(`${crore >= 100 ? threeDigits(crore) : twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));
  let s = `Rupees ${parts.join(" ")}`;
  if (paise) s += ` and ${twoDigits(paise)} Paise`;
  return s + " Only";
}

/** Normalise an Indian mobile number to +91XXXXXXXXXX */
export function normalizePhone(p: string): string | null {
  const digits = (p || "").replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return null;
}

export function n(v: unknown): number {
  const x = Number(v ?? 0);
  return isFinite(x) ? x : 0;
}

export function round2(v: number) {
  return Math.round(v * 100) / 100;
}
