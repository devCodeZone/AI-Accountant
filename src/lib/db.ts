import "server-only";
import { sb, fetchAll } from "./supabase";
import { n } from "./format";
import type { Account, Category, Company, Invoice, Party, Project, Stage, Txn } from "./types";

// ---- Normalisers (Postgres numeric arrives as string) ----
export const normTxn = (r: any): Txn => ({
  ...r,
  amount: n(r.amount),
  gst_amount: n(r.gst_amount),
  tds_amount: n(r.tds_amount),
  gst_rate: r.gst_rate == null ? null : n(r.gst_rate),
  ai_confidence: r.ai_confidence == null ? null : n(r.ai_confidence),
  attachments: r.attachments ?? [],
});
const normAcc = (r: any): Account => ({ ...r, opening_balance: n(r.opening_balance) });
const normParty = (r: any): Party => ({ ...r, opening_balance: n(r.opening_balance) });
const normProject = (r: any): Project => ({ ...r, quoted_value: n(r.quoted_value), budget: r.budget ?? {} });
const normStage = (r: any): Stage => ({ ...r, amount: n(r.amount) });
export const normInvoice = (r: any): Invoice => ({
  ...r,
  subtotal: n(r.subtotal), cgst: n(r.cgst), sgst: n(r.sgst), igst: n(r.igst), total: n(r.total),
  items: r.items ?? [],
});

export async function getCompany(companyId: string): Promise<Company> {
  const { data, error } = await sb().from("companies").select("*").eq("id", companyId).single();
  if (error || !data) throw new Error("Company not found");
  return data as Company;
}

export interface Book {
  company: Company;
  accounts: Account[];
  categories: Category[];
  parties: Party[];
  projects: Project[];
  stages: Stage[];
  invoices: Invoice[];
  txns: Txn[];      // confirmed, not deleted — the source of truth for every total
  pending: Txn[];   // draft + needs_review
}

/** Load a company's whole book. Small businesses have thousands, not millions, of rows. */
export async function loadBook(companyId: string): Promise<Book> {
  const db = sb();
  const [company, accounts, categories, parties, projects, stages, invoices, all] = await Promise.all([
    getCompany(companyId),
    db.from("accounts").select("*").eq("company_id", companyId).order("created_at"),
    db.from("categories").select("*").eq("company_id", companyId).order("sort"),
    fetchAll((a, b) => db.from("parties").select("*").eq("company_id", companyId).is("deleted_at", null).order("name").range(a, b)),
    db.from("projects").select("*").eq("company_id", companyId).is("deleted_at", null).order("created_at", { ascending: false }),
    db.from("project_stages").select("*").eq("company_id", companyId).order("sort"),
    fetchAll((a, b) => db.from("invoices").select("*").eq("company_id", companyId).is("deleted_at", null).order("doc_date", { ascending: false }).range(a, b)),
    fetchAll((a, b) => db.from("transactions").select("*").eq("company_id", companyId).is("deleted_at", null).order("txn_date").order("created_at").range(a, b)),
  ]);
  const txAll = (all as any[]).map(normTxn);
  return {
    company,
    accounts: (accounts.data ?? []).map(normAcc),
    categories: (categories.data ?? []) as Category[],
    parties: (parties as any[]).map(normParty),
    projects: (projects.data ?? []).map(normProject),
    stages: (stages.data ?? []).map(normStage),
    invoices: (invoices as any[]).map(normInvoice),
    txns: txAll.filter((t) => t.status === "confirmed"),
    pending: txAll.filter((t) => t.status !== "confirmed"),
  };
}

export async function audit(
  companyId: string, userId: string | null, entity: string, entityId: string | null,
  action: string, before: unknown = null, after: unknown = null,
) {
  await sb().from("audit_log").insert({ company_id: companyId, user_id: userId, entity, entity_id: entityId, action, before, after });
}

// ---- Fuzzy matching (Dice coefficient on bigrams) ----
function bigrams(s: string) {
  const t = s.toLowerCase().replace(/[^a-z0-9ऀ-ॿ ]/g, " ").replace(/\s+/g, " ").trim();
  const out = new Map<string, number>();
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const A = bigrams(a), B = bigrams(b);
  let inter = 0, total = 0;
  A.forEach((v, k) => { inter += Math.min(v, B.get(k) ?? 0); total += v; });
  B.forEach((v) => (total += v));
  const dice = total ? (2 * inter) / total : 0;
  const al = a.toLowerCase(), bl = b.toLowerCase();
  const contains = al.includes(bl) || bl.includes(al) ? 0.25 : 0;
  return Math.min(1, dice + contains);
}

export function bestMatch<T>(query: string | null | undefined, items: T[], label: (t: T) => string, min = 0.55): T | null {
  if (!query) return null;
  let best: T | null = null, score = 0;
  for (const it of items) {
    const s = similarity(query, label(it));
    if (s > score) { score = s; best = it; }
  }
  return score >= min ? best : null;
}
