import "server-only";
import { generateJSON, type Part } from "./gemini";
import { bestMatch } from "../db";
import type { Refs } from "../refs";
import type { DraftEntry, Source } from "../types";
import { addDays, todayISO } from "../format";

const S = (type: string, extra: Record<string, unknown> = {}) => ({ type, ...extra });
const ENTRY_SCHEMA = {
  type: "OBJECT",
  properties: {
    transcript: S("STRING", { nullable: true, description: "What the user said/wrote, cleaned up (for voice or handwriting)" }),
    entries: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          txn_date: S("STRING", { description: "YYYY-MM-DD" }),
          amount: S("NUMBER", { description: "Total amount in rupees incl. GST" }),
          direction: S("STRING", { enum: ["in", "out"] }),
          entry_type: S("STRING", { enum: ["money", "vendor_bill", "labour_work"] }),
          mode: S("STRING", { enum: ["cash", "bank", "upi", "cheque", "card"], nullable: true }),
          account_hint: S("STRING", { nullable: true }),
          party_name: S("STRING", { nullable: true }),
          party_type: S("STRING", { enum: ["client", "vendor", "labour", "other"], nullable: true }),
          party_trade: S("STRING", { enum: ["carpenter", "painter", "electrician", "plumber", "pop", "mason", "helper", "subcontractor"], nullable: true }),
          project_hint: S("STRING", { nullable: true }),
          category: S("STRING", { nullable: true, description: "Exactly one of the allowed category names" }),
          sub_category: S("STRING", { nullable: true }),
          gst_rate: S("NUMBER", { nullable: true }),
          gst_amount: S("NUMBER", { nullable: true }),
          tds_amount: S("NUMBER", { nullable: true }),
          bill_no: S("STRING", { nullable: true }),
          reference: S("STRING", { nullable: true, description: "UTR / UPI ref / cheque number" }),
          due_date: S("STRING", { nullable: true }),
          settles_bill: S("BOOLEAN", { nullable: true }),
          notes: S("STRING", { nullable: true }),
          is_approximate: S("BOOLEAN"),
          is_transfer: S("BOOLEAN"),
          confidence: S("NUMBER", { description: "0 to 1" }),
          question: S("STRING", { nullable: true, description: "ONE short follow-up question only if something essential is unclear" }),
          line_items: { type: "ARRAY", nullable: true, items: { type: "OBJECT", properties: { description: S("STRING"), qty: S("NUMBER", { nullable: true }), rate: S("NUMBER", { nullable: true }), amount: S("NUMBER", { nullable: true }) }, required: ["description"] } },
        },
        required: ["txn_date", "amount", "direction", "entry_type", "is_approximate", "is_transfer", "confidence"],
      },
    },
  },
  required: ["entries"],
};

function systemPrompt(refs: Refs, companyName: string) {
  const t = todayISO();
  const cats = refs.categories.filter((c) => !c.is_transfer).map((c) => `${c.group_name} > ${c.name}`).join("\n");
  const parties = refs.parties.slice(0, 300).map((p) => `${p.name} (${p.type}${p.trade ? ", " + p.trade : ""})`).join("; ");
  const projects = refs.projects.slice(0, 100).map((p) => p.name).join("; ");
  return `You are the accountant for "${companyName}", an Indian interior design / home-improvement company.
Turn the user's input (typed, spoken, or a photo of a bill, handwritten kachha slip, UPI/GPay/PhonePe screenshot, cheque, or bank SMS) into ledger entries.
Today is ${t} (yesterday ${addDays(t, -1)}). Input may be English, Hindi or Hinglish.

Rules:
- direction "out" = money paid / given / diye / de diya / bheje / kharcha. "in" = received / mila / aaya / client ne diya.
- Amounts: "20k" = 20000, "1.5 lakh"/"dedh lakh" = 150000, "dhai hazaar" = 2500. Amount is the final total paid (incl. GST).
- Dates: "kal" = yesterday, "parso" = 2 days ago, "last week"/"pichle hafte" ≈ 7 days ago (then is_approximate=true). No date → today (or the date printed on the bill).
- Words like "around", "about", "lagbhag", "shayad", "I think", "yaad nahi" → is_approximate=true and confidence ≤ 0.6.
- entry_type: "money" for actual payments/receipts. "vendor_bill" only when goods were bought on credit and NOT paid yet ("udhaar", "bill aaya, payment baad mein"). "labour_work" only for value of work completed by a contractor without payment.
- settles_bill=true when the user pays a vendor against an earlier credit bill ("pichla bill clear kiya").
- Cash withdrawn from bank / deposited into bank → is_transfer=true (mode = source account type).
- Mode: GPay/PhonePe/Paytm/UPI → "upi"; NEFT/RTGS/IMPS/transfer → "bank"; otherwise "cash" if they say cash/nakad, else best guess.
- party_name: the person/shop. Prefer an existing name from the list when it clearly refers to the same party (e.g. "Ramesh" → "Ramesh (Carpenter)"). For labour, set party_type="labour" and party_trade.
- project_hint: the site/project/client mentioned (e.g. "Sharma Sector 56"). Match to the project list where possible.
- category: MUST be exactly one name from the allowed list (the part after ">"). Labour payments → the matching trade under Project labour. Income from clients → Booking advance / Milestone payment / Final payment / Extra / change-order work.
- For bills/receipts: read vendor, bill number, date, GSTIN, GST rate & amount, total and line items. If CGST+SGST are shown, gst_amount is their sum.
- One input can contain several entries — return each separately.
- If an essential field (amount, or whether money came in or went out) is unclear, still return your best guess with low confidence and ONE short question.
- Never invent amounts that are not present.

Allowed categories:
${cats}

Existing parties: ${parties || "(none yet)"}
Existing projects: ${projects || "(none yet)"}
Accounts: ${refs.accounts.map((a) => `${a.name} [${a.type}]`).join("; ")}`;
}

type RawEntry = {
  txn_date: string; amount: number; direction: "in" | "out"; entry_type: DraftEntry["entry_type"]; mode?: DraftEntry["mode"];
  account_hint?: string | null; party_name?: string | null; party_type?: DraftEntry["party_type"]; party_trade?: string | null;
  project_hint?: string | null; category?: string | null; sub_category?: string | null; gst_rate?: number | null; gst_amount?: number | null;
  tds_amount?: number | null; bill_no?: string | null; reference?: string | null; due_date?: string | null; settles_bill?: boolean | null;
  notes?: string | null; is_approximate: boolean; is_transfer: boolean; confidence: number; question?: string | null;
  line_items?: DraftEntry["line_items"];
};

export async function extractEntries(refs: Refs, companyName: string, parts: Part[], source: Source, attachments: string[] = []) {
  const out = await generateJSON<{ transcript?: string | null; entries: RawEntry[] }>(systemPrompt(refs, companyName), parts, ENTRY_SCHEMA);
  const drafts = (out.entries ?? []).filter((e) => Number(e.amount) > 0).map((e) => toDraft(e, refs, source, attachments));
  return { transcript: out.transcript ?? null, drafts };
}

export function toDraft(e: RawEntry, refs: Refs, source: Source, attachments: string[]): DraftEntry {
  const cat = e.category
    ? refs.categories.find((c) => c.name.toLowerCase() === e.category!.toLowerCase()) ?? bestMatch(e.category, refs.categories.filter((c) => !c.is_transfer), (c) => c.name, 0.5)
    : null;
  const party = bestMatch(e.party_name, refs.parties, (p) => p.name, 0.6);
  const project = bestMatch(e.project_hint, refs.projects, (p) => p.name, 0.45);
  const account = e.account_hint ? bestMatch(e.account_hint, refs.accounts, (a) => a.name, 0.5) : null;
  let confidence = Math.max(0, Math.min(1, Number(e.confidence) || 0.5));
  if (!cat && !e.is_transfer) confidence = Math.min(confidence, 0.6);
  if (e.project_hint && !project) confidence = Math.min(confidence, 0.75);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(e.txn_date) ? e.txn_date : todayISO();
  return {
    key: Math.random().toString(36).slice(2),
    txn_date: date,
    amount: Math.round(Number(e.amount) * 100) / 100,
    direction: e.direction === "in" ? "in" : "out",
    entry_type: e.is_transfer ? "money" : e.entry_type ?? "money",
    mode: e.entry_type === "money" || e.is_transfer ? e.mode ?? "cash" : null,
    account_id: account?.id ?? null,
    party_id: party?.id ?? null,
    party_name: party?.name ?? e.party_name ?? null,
    party_type: (party?.type as DraftEntry["party_type"]) ?? e.party_type ?? null,
    party_trade: party?.trade ?? e.party_trade ?? null,
    project_id: project?.id ?? null,
    project_name: e.project_hint ?? null,
    category_id: e.is_transfer ? refs.categories.find((c) => c.is_transfer)?.id ?? null : cat?.id ?? null,
    sub_category: e.sub_category ?? null,
    gst_rate: e.gst_rate ?? null,
    gst_amount: Number(e.gst_amount ?? 0) || 0,
    tds_amount: Number(e.tds_amount ?? 0) || 0,
    bill_no: e.bill_no ?? null,
    reference: e.reference ?? null,
    due_date: e.due_date && /^\d{4}-\d{2}-\d{2}$/.test(e.due_date) ? e.due_date : null,
    settles_bill: !!e.settles_bill,
    notes: e.notes ?? null,
    attachments,
    source,
    is_approximate: !!e.is_approximate,
    is_transfer: !!e.is_transfer,
    to_account_id: null,
    confidence: Math.round(confidence * 100) / 100,
    question: e.question ?? null,
    line_items: e.line_items ?? undefined,
  };
}
