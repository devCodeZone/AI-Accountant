import QRCode from "qrcode";
import type { Company, Invoice, Party, Project } from "@/lib/types";
import { amountInWords, dmy } from "@/lib/format";
import { stateName } from "@/lib/gst";

const money = (v: number) => new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
const TITLE = { invoice: "TAX INVOICE", quotation: "QUOTATION", receipt: "PAYMENT RECEIPT" };

export async function InvoiceDoc({ inv, company, party, project }: { inv: Invoice; company: Company; party: Party | null; project: Project | null }) {
  const gstOn = !!company.gstin && inv.doc_type !== "receipt";
  const due = inv.total;
  const qr = company.upi_id && inv.doc_type === "invoice" && inv.status !== "paid"
    ? await QRCode.toDataURL(`upi://pay?pa=${encodeURIComponent(company.upi_id)}&pn=${encodeURIComponent(company.name)}&am=${due.toFixed(2)}&cu=INR&tn=${encodeURIComponent(inv.number)}`, { margin: 1, width: 160 })
    : null;
  const title = inv.doc_type === "invoice" && !gstOn ? "INVOICE" : TITLE[inv.doc_type];
  return (
    <div className="print-page mx-auto max-w-3xl rounded-2xl border border-line bg-white p-6 text-sm text-ink sm:p-10" style={{ ["--brand" as string]: company.brand_color }}>
      <div className="flex items-start justify-between gap-4 border-b-4 pb-4" style={{ borderColor: company.brand_color }}>
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {company.logo_url && <img src={company.logo_url} alt="" className="h-14 w-14 rounded object-contain" />}
          <div>
            <div className="text-xl font-bold" style={{ color: company.brand_color }}>{company.legal_name || company.name}</div>
            <div className="text-xs leading-relaxed text-stone-600">
              {[company.address, company.city, company.state, company.pincode].filter(Boolean).join(", ")}<br />
              {[company.phone, company.email].filter(Boolean).join(" · ")}<br />
              {company.gstin && <>GSTIN: <b>{company.gstin}</b> · </>}{company.pan && <>PAN: {company.pan}</>}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold tracking-wide">{title}</div>
          <div className="text-xs text-stone-600">No. <b>{inv.number}</b><br />Date: {dmy(inv.doc_date)}{inv.due_date && <><br />Due: {dmy(inv.due_date)}</>}</div>
          {inv.status === "cancelled" && <div className="mt-1 font-bold text-red-600">CANCELLED</div>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 py-4 text-xs">
        <div>
          <div className="mb-1 font-semibold uppercase text-stone-500">{inv.doc_type === "receipt" ? "Received from" : "Bill to"}</div>
          <div className="text-sm font-semibold">{party?.name ?? "—"}</div>
          {party?.address && <div>{party.address}</div>}
          {party?.phone && <div>Ph: {party.phone}</div>}
          {party?.gstin && <div>GSTIN: <b>{party.gstin}</b></div>}
        </div>
        <div className="text-right">
          {project && <><div className="mb-1 font-semibold uppercase text-stone-500">Project / site</div><div className="text-sm font-semibold">{project.name}</div>{project.site_address && <div>{project.site_address}</div>}</>}
          {gstOn && <div className="mt-1">Place of supply: {stateName(inv.place_of_supply)} ({inv.place_of_supply})</div>}
        </div>
      </div>

      <table className="w-full border-collapse text-xs tabular">
        <thead>
          <tr className="text-left text-white" style={{ background: company.brand_color }}>
            <th className="p-2">#</th><th className="p-2">Description</th>{gstOn && <th className="p-2">HSN/SAC</th>}
            <th className="p-2 text-right">Qty</th><th className="p-2 text-right">Rate</th>{gstOn && <th className="p-2 text-right">GST</th>}<th className="p-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {inv.items.map((it, i) => (
            <tr key={i} className="border-b border-stone-200">
              <td className="p-2 align-top">{i + 1}</td><td className="p-2">{it.description}</td>{gstOn && <td className="p-2">{it.hsn_sac}</td>}
              <td className="p-2 text-right">{it.qty} {it.unit}</td><td className="p-2 text-right">{money(it.rate)}</td>{gstOn && <td className="p-2 text-right">{it.gst_rate}%</td>}
              <td className="p-2 text-right">{money(it.qty * it.rate)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex justify-end">
        <table className="w-64 text-xs tabular">
          <tbody>
            <tr><td className="py-1">Subtotal</td><td className="py-1 text-right">₹{money(inv.subtotal)}</td></tr>
            {inv.cgst > 0 && <tr><td className="py-1">CGST</td><td className="py-1 text-right">₹{money(inv.cgst)}</td></tr>}
            {inv.sgst > 0 && <tr><td className="py-1">SGST</td><td className="py-1 text-right">₹{money(inv.sgst)}</td></tr>}
            {inv.igst > 0 && <tr><td className="py-1">IGST</td><td className="py-1 text-right">₹{money(inv.igst)}</td></tr>}
            <tr className="border-t-2 text-sm font-bold" style={{ borderColor: company.brand_color }}><td className="py-1.5">Total</td><td className="py-1.5 text-right">₹{money(inv.total)}</td></tr>
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-xs"><b>Amount in words:</b> {amountInWords(inv.total)}</div>

      <div className="mt-6 grid grid-cols-[1fr_auto] gap-4 border-t border-stone-200 pt-4 text-xs">
        <div className="space-y-2">
          {inv.doc_type !== "receipt" && company.bank_account_no && (
            <div><div className="font-semibold">Bank details</div>{company.bank_name} · A/c {company.bank_account_no} · IFSC {company.bank_ifsc}{company.upi_id && <> · UPI {company.upi_id}</>}</div>
          )}
          {inv.notes && <div><div className="font-semibold">Notes</div><div className="whitespace-pre-line">{inv.notes}</div></div>}
          {inv.terms && <div><div className="font-semibold">Terms</div><div className="whitespace-pre-line">{inv.terms}</div></div>}
          {inv.doc_type === "quotation" && <div className="text-stone-500">This is a quotation, not a demand for payment.</div>}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {qr && <div className="text-center"><img src={qr} alt="UPI QR" className="h-28 w-28" /><div className="text-[10px] text-stone-500">Scan to pay by UPI</div></div>}
      </div>
      <div className="mt-10 flex justify-end text-xs"><div className="text-center"><div className="h-10" /><div className="border-t border-stone-400 px-8 pt-1">For {company.legal_name || company.name}<br />Authorised signatory</div></div></div>
      {inv.doc_type === "invoice" && gstOn && <div className="mt-4 text-center text-[10px] text-stone-400">Computer-generated invoice.</div>}
    </div>
  );
}
