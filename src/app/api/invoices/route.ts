import { handle, bad } from "@/lib/api";
import { apiSession } from "@/lib/session";
import { assert, can } from "@/lib/permissions";
import { sb } from "@/lib/supabase";
import { audit, getCompany } from "@/lib/db";
import { computeInvoice } from "@/lib/gst";
import { fyOf } from "@/lib/format";
import type { InvoiceItem } from "@/lib/types";

export const POST = handle(async (req: Request) => {
  const s = await apiSession();
  assert(can.documents(s.role));
  const b = await req.json();
  const docType = ["invoice", "quotation", "receipt"].includes(b.doc_type) ? b.doc_type : "invoice";
  const items: InvoiceItem[] = (b.items ?? []).filter((i: any) => i.description && Number(i.qty) > 0).map((i: any) => ({
    description: String(i.description), hsn_sac: i.hsn_sac || "", qty: Number(i.qty), unit: i.unit || "", rate: Number(i.rate) || 0, gst_rate: Number(i.gst_rate) || 0,
  }));
  if (!items.length) bad("Add at least one line item");
  const company = await getCompany(s.company_id);
  const gstOn = !!company.gstin && docType !== "receipt";
  const date = b.doc_date || new Date().toISOString().slice(0, 10);
  const pos = b.place_of_supply || company.state_code;
  const totals = computeInvoice(items, company.state_code, pos, gstOn);
  const db = sb();
  const fy = fyOf(date, company.fy_start_month);
  const { data: no, error: nerr } = await db.rpc("next_doc_no", { p_company: s.company_id, p_type: docType, p_fy: fy });
  if (nerr) throw nerr;
  const prefix = docType === "invoice" ? company.invoice_prefix : docType === "receipt" ? company.receipt_prefix : company.quotation_prefix;
  const number = `${prefix}/${fy}/${String(no).padStart(3, "0")}`;
  const { data, error } = await db.from("invoices").insert({
    company_id: s.company_id, doc_type: docType, number, doc_date: date, due_date: b.due_date || null,
    party_id: b.party_id || null, project_id: b.project_id || null, stage_id: docType === "invoice" ? b.stage_id || null : null,
    transaction_id: b.transaction_id || null, place_of_supply: pos, items: items.map((i) => ({ ...i, gst_rate: gstOn ? i.gst_rate : 0 })),
    subtotal: totals.subtotal, cgst: totals.cgst, sgst: totals.sgst, igst: totals.igst, total: totals.total,
    notes: b.notes || null, terms: b.terms || null, status: docType === "receipt" ? "paid" : "draft", created_by: s.uid,
  }).select("id").single();
  if (error) throw error;
  if (docType === "invoice" && b.stage_id) await db.from("project_stages").update({ status: "invoiced" }).eq("id", b.stage_id).eq("company_id", s.company_id).eq("status", "pending");
  if (b.transaction_id) await db.from("transactions").update({ invoice_id: data.id }).eq("id", b.transaction_id).eq("company_id", s.company_id);
  await audit(s.company_id, s.uid, "invoice", data.id, "create", null, { number, total: totals.total });
  return { id: data.id };
});
