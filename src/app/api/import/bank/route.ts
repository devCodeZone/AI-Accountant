import { handle, bad } from "@/lib/api";
import { apiSession } from "@/lib/session";
import { assert, can } from "@/lib/permissions";
import { getCompany, normTxn } from "@/lib/db";
import { getRefs } from "@/lib/refs";
import { sb, BUCKET, fetchAll } from "@/lib/supabase";
import { linesFromPdf, prepareBank } from "@/lib/ai/bank";
import type { BankLine } from "@/lib/import-utils";

export const maxDuration = 60;

export const POST = handle(async (req: Request) => {
  const s = await apiSession();
  assert(can.editEntries(s.role));
  const body = await req.json();
  const refs = await getRefs(s.company_id);
  const account = refs.accounts.find((a) => a.id === body.account_id && a.type !== "cash");
  if (!account) bad("Choose the bank account this statement belongs to");
  let lines: BankLine[] = Array.isArray(body.lines) ? body.lines : [];
  if (body.pdf_path) {
    if (!String(body.pdf_path).startsWith(`${s.company_id}/`)) bad("Bad file");
    const { data } = await sb().storage.from(BUCKET).download(body.pdf_path);
    if (!data) bad("Could not read the PDF");
    lines = await linesFromPdf(Buffer.from(await data.arrayBuffer()).toString("base64"));
  }
  if (!lines.length) bad("No transactions found in the file");
  if (lines.length > 1500) bad("Too many lines — import one or two months at a time");
  const dates = lines.map((l) => l.date).sort();
  const from = new Date(new Date(dates[0]).getTime() - 7 * 864e5).toISOString().slice(0, 10);
  const existing = (await fetchAll((a, b) => sb().from("transactions").select("*").eq("company_id", s.company_id).is("deleted_at", null).gte("txn_date", from).range(a, b))).map(normTxn);
  const company = await getCompany(s.company_id);
  let warning: string | null = null;
  let drafts;
  try {
    drafts = await prepareBank(lines, existing, account.id, refs, company.name, body.ai !== false);
  } catch (e: any) {
    // AI unavailable → still give the user matching + duplicate detection, categories left blank
    warning = `AI categorisation skipped: ${e.message}`;
    drafts = await prepareBank(lines, existing, account.id, refs, company.name, false);
  }
  return { drafts, from: dates[0], to: dates[dates.length - 1], warning };
});
