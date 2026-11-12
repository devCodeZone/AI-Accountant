import "server-only";
import { generateJSON, type Part } from "./gemini";
import { bestMatch, similarity } from "../db";
import type { Refs } from "../refs";
import type { BankLine } from "../import-utils";
import type { DraftEntry, Txn } from "../types";
import { daysBetween } from "../format";

/** Read lines from a PDF bank statement with Gemini. */
export async function linesFromPdf(base64: string): Promise<BankLine[]> {
  const out = await generateJSON<{ lines: BankLine[] }>(
    "You read Indian bank statements. Extract every transaction row. Dates as YYYY-MM-DD. direction 'out' for withdrawals/debits, 'in' for deposits/credits. amount is positive. Skip opening/closing balance rows.",
    [{ inlineData: { mimeType: "application/pdf", data: base64 } }, { text: "Extract all transactions." }],
    {
      type: "OBJECT",
      properties: { lines: { type: "ARRAY", items: { type: "OBJECT", properties: {
        date: { type: "STRING" }, narration: { type: "STRING" }, amount: { type: "NUMBER" }, direction: { type: "STRING", enum: ["in", "out"] }, reference: { type: "STRING", nullable: true },
      }, required: ["date", "narration", "amount", "direction"] } } },
      required: ["lines"],
    },
  );
  return (out.lines ?? []).filter((l) => l.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(l.date));
}

type AiCat = { i: number; category: string | null; party_name: string | null; party_type: "client" | "vendor" | "labour" | "other" | null; mode: "bank" | "upi" | "cheque" | "card" | "cash" | null; is_transfer: boolean; confidence: number };

async function categorise(lines: BankLine[], refs: Refs, company: string): Promise<AiCat[]> {
  if (!lines.length) return [];
  const cats = refs.categories.filter((c) => !c.is_transfer).map((c) => c.name).join(" | ");
  const parties = refs.parties.slice(0, 300).map((p) => `${p.name} (${p.type})`).join("; ");
  const out: AiCat[] = [];
  for (let start = 0; start < lines.length; start += 60) {
    const chunk = lines.slice(start, start + 60);
    const parts: Part[] = [{ text: chunk.map((l, j) => `${start + j}\t${l.date}\t${l.direction}\t${l.amount}\t${l.narration}`).join("\n") }];
    const r = await generateJSON<{ items: AiCat[] }>(
      `You categorise bank statement lines for "${company}", an Indian interior design company.
For each line (index, date, direction, amount, narration) pick: category (exactly one of: ${cats}), the counterparty name (cleaned, e.g. "UPI/RAMESH KUMAR/okaxis" → "Ramesh Kumar"; match an existing party when it is clearly the same: ${parties || "none"}), party_type, mode (UPI/IMPS/NEFT/RTGS/CHQ/POS/ATM → upi/bank/bank/bank/cheque/card/…), is_transfer=true for ATM cash withdrawals or cash deposits or transfers between own accounts. Bank charges/GST on charges → "Bank charges". confidence 0-1.`,
      parts,
      { type: "OBJECT", properties: { items: { type: "ARRAY", items: { type: "OBJECT", properties: {
        i: { type: "INTEGER" }, category: { type: "STRING", nullable: true }, party_name: { type: "STRING", nullable: true },
        party_type: { type: "STRING", enum: ["client", "vendor", "labour", "other"], nullable: true }, mode: { type: "STRING", enum: ["bank", "upi", "cheque", "card", "cash"], nullable: true },
        is_transfer: { type: "BOOLEAN" }, confidence: { type: "NUMBER" },
      }, required: ["i", "is_transfer", "confidence"] } } }, required: ["items"] },
    );
    out.push(...(r.items ?? []));
  }
  return out;
}

/** Match against existing entries, flag duplicates, AI-categorise the rest. Returns drafts — nothing saved. */
export async function prepareBank(lines: BankLine[], existing: Txn[], accountId: string, refs: Refs, company: string, useAi: boolean) {
  const used = new Set<string>();
  const drafts: DraftEntry[] = [];
  const toAi: { line: BankLine; idx: number }[] = [];
  lines.forEach((l, idx) => {
    // duplicate of an earlier bank import (same ref, or same date+amount+narration)
    const dup = existing.find((t) => t.source === "bank_import" && t.amount === l.amount && t.direction === l.direction &&
      ((l.reference && t.reference === l.reference) || (t.txn_date === l.date && similarity(t.notes ?? "", l.narration) > 0.85)));
    // match to an entry typed earlier (same amount & direction, within 3 days, not already reconciled)
    const match = dup ? undefined : existing.find((t) => !used.has(t.id) && !t.reconciled && t.entry_type === "money" && t.mode !== "cash" &&
      t.amount === l.amount && t.direction === l.direction && Math.abs(daysBetween(t.txn_date, l.date)) <= 3 && (!t.account_id || t.account_id === accountId));
    if (match) used.add(match.id);
    const d: DraftEntry = {
      key: `b${idx}`, txn_date: l.date, amount: l.amount, direction: l.direction, entry_type: "money", mode: "bank", account_id: accountId,
      party_id: match?.party_id ?? null, party_name: null, party_type: null, party_trade: null, project_id: match?.project_id ?? null, project_name: null,
      category_id: match?.category_id ?? null, sub_category: null, gst_rate: null, gst_amount: 0, tds_amount: 0, bill_no: null,
      reference: l.reference, due_date: null, settles_bill: false, notes: l.narration, attachments: [], source: "bank_import",
      is_approximate: false, is_transfer: false, to_account_id: null, confidence: match ? 0.95 : 0.5, question: null,
      match_txn_id: match?.id ?? null, duplicate_of: dup?.id ?? null,
    };
    drafts.push(d);
    if (!match && !dup) toAi.push({ line: l, idx });
  });
  if (useAi && toAi.length) {
    const cats = await categorise(toAi.map((x) => x.line), refs, company);
    cats.forEach((c) => {
      const target = toAi[c.i];
      if (!target) return;
      const d = drafts[target.idx];
      const cat = c.category ? refs.categories.find((x) => x.name.toLowerCase() === c.category!.toLowerCase()) ?? bestMatch(c.category, refs.categories, (x) => x.name, 0.6) : null;
      const party = bestMatch(c.party_name, refs.parties, (p) => p.name, 0.7);
      d.is_transfer = !!c.is_transfer;
      d.category_id = c.is_transfer ? refs.categories.find((x) => x.is_transfer)?.id ?? null : cat?.id ?? null;
      d.party_id = c.is_transfer ? null : party?.id ?? null;
      d.party_name = c.is_transfer ? null : party?.name ?? c.party_name;
      d.party_type = (party?.type as DraftEntry["party_type"]) ?? c.party_type;
      d.mode = c.mode && c.mode !== "cash" ? c.mode : "bank";
      d.confidence = Math.round(Math.max(0, Math.min(1, c.confidence || 0.5)) * 100) / 100;
    });
  }
  return drafts;
}
