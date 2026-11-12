import { handle, bad } from "@/lib/api";
import { apiSession } from "@/lib/session";
import { assert, can } from "@/lib/permissions";
import { getRefs } from "@/lib/refs";
import { bestMatch } from "@/lib/db";
import { parseAmount, parseDate } from "@/lib/import-utils";
import type { DraftEntry, Mode } from "@/lib/types";

/** Turn mapped rows from an existing Excel ledger into drafts (preview before saving). */
export const POST = handle(async (req: Request) => {
  const s = await apiSession();
  assert(can.editEntries(s.role));
  const { rows } = await req.json();
  if (!Array.isArray(rows) || !rows.length) bad("No rows");
  if (rows.length > 3000) bad("Max 3000 rows at a time");
  const refs = await getRefs(s.company_id);
  const drafts: DraftEntry[] = [];
  const skipped: number[] = [];
  rows.forEach((r: Record<string, unknown>, i: number) => {
    const date = parseDate(r.date);
    let amount = 0, direction: "in" | "out" = "out";
    const dr = Math.abs(parseAmount(r.debit)), cr = Math.abs(parseAmount(r.credit));
    if (dr || cr) { amount = dr || cr; direction = cr && !dr ? "in" : "out"; }
    else {
      const a = parseAmount(r.amount);
      amount = Math.abs(a);
      const d = String(r.direction ?? "").toLowerCase();
      direction = /in|receiv|credit|cr|mila|aaya/.test(d) ? "in" : /out|paid|debit|dr|diya|expense/.test(d) ? "out" : a < 0 ? "out" : "out";
    }
    if (!date || !(amount > 0)) { skipped.push(i + 1); return; }
    const m = String(r.mode ?? "").toLowerCase();
    const mode: Mode = /upi|gpay|phonepe|paytm/.test(m) ? "upi" : /cheque|chq/.test(m) ? "cheque" : /card/.test(m) ? "card" : /bank|neft|rtgs|imps|online|transfer/.test(m) ? "bank" : "cash";
    const catText = String(r.category ?? "");
    const cat = catText ? refs.categories.find((c) => c.name.toLowerCase() === catText.toLowerCase()) ?? bestMatch(catText, refs.categories, (c) => c.name, 0.5) : null;
    const partyText = String(r.party ?? "").trim();
    const party = bestMatch(partyText, refs.parties, (p) => p.name, 0.8);
    const projText = String(r.project ?? "").trim();
    const project = bestMatch(projText, refs.projects, (p) => p.name, 0.5);
    drafts.push({
      key: `x${i}`, txn_date: date, amount: Math.round(amount * 100) / 100, direction, entry_type: "money", mode, account_id: null,
      party_id: party?.id ?? null, party_name: party?.name ?? (partyText || null), party_type: null, party_trade: null,
      project_id: project?.id ?? null, project_name: projText || null, category_id: cat?.id ?? null, sub_category: catText && !cat ? catText : null,
      gst_rate: null, gst_amount: 0, tds_amount: 0, bill_no: String(r.bill_no ?? "") || null, reference: null, due_date: null, settles_bill: false,
      notes: String(r.notes ?? "") || null, attachments: [], source: "excel_import", is_approximate: false, is_transfer: false, to_account_id: null,
      confidence: cat ? 0.9 : 0.5, question: null,
    });
  });
  return { drafts, skipped };
});
