"use client";
import { useState } from "react";
import { Button, Field, Input, Select } from "./ui";
import { STATES } from "@/lib/gst";

export type CompanyDraft = Record<string, string | number | null | undefined>;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Used by onboarding (wizard) and settings (all sections at once). */
export function CompanyForm({ initial, wizard, submitLabel, onSubmit }: {
  initial: CompanyDraft; wizard?: boolean; submitLabel: string; onSubmit: (v: CompanyDraft) => Promise<string | void>;
}) {
  const [v, setV] = useState<CompanyDraft>(initial);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const set = (k: string) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const val = (k: string) => (v[k] ?? "") as string;

  const sections = [
    { title: "Your company", body: (
      <>
        {wizard && <Field label="Your name"><Input value={val("owner_name")} onChange={set("owner_name")} placeholder="e.g. Rahul Verma" /></Field>}
        <Field label="Company / brand name *"><Input required value={val("name")} onChange={set("name")} placeholder="e.g. Inviting Homes" /></Field>
        <Field label="Legal name (on invoices)"><Input value={val("legal_name")} onChange={set("legal_name")} /></Field>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Logo URL" hint="Paste a link to your logo image (PNG/JPG)"><Input value={val("logo_url")} onChange={set("logo_url")} placeholder="https://…/logo.png" /></Field>
          <Field label="Brand colour"><input type="color" value={val("brand_color") || "#0f766e"} onChange={set("brand_color")} className="h-10 w-14 rounded-xl border border-line" /></Field>
        </div>
      </>
    ) },
    { title: "Address & tax", body: (
      <>
        <Field label="Address"><Input value={val("address")} onChange={set("address")} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="City"><Input value={val("city")} onChange={set("city")} /></Field>
          <Field label="PIN code"><Input inputMode="numeric" value={val("pincode")} onChange={set("pincode")} /></Field>
        </div>
        <Field label="State" hint="Decides CGST+SGST (same state) vs IGST (other state)">
          <Select value={val("state_code")} onChange={(e) => setV((x) => ({ ...x, state_code: e.target.value, state: STATES.find(([c]) => c === e.target.value)?.[1] ?? "" }))}>
            <option value="">Select state</option>
            {STATES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone"><Input value={val("phone")} onChange={set("phone")} /></Field>
          <Field label="Email"><Input type="email" value={val("email")} onChange={set("email")} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="GSTIN (optional)" hint="Leave blank to switch off GST"><Input value={val("gstin")} onChange={set("gstin")} className="uppercase" maxLength={15} /></Field>
          <Field label="PAN"><Input value={val("pan")} onChange={set("pan")} className="uppercase" maxLength={10} /></Field>
        </div>
      </>
    ) },
    { title: "Bank & UPI (shown on invoices)", body: (
      <>
        <Field label="Bank name"><Input value={val("bank_name")} onChange={set("bank_name")} placeholder="e.g. HDFC Bank" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Account number"><Input inputMode="numeric" value={val("bank_account_no")} onChange={set("bank_account_no")} /></Field>
          <Field label="IFSC"><Input value={val("bank_ifsc")} onChange={set("bank_ifsc")} className="uppercase" /></Field>
        </div>
        <Field label="UPI ID" hint="Used for the pay-by-UPI QR on invoices"><Input value={val("upi_id")} onChange={set("upi_id")} placeholder="name@bank" /></Field>
      </>
    ) },
    { title: "Numbering & year", body: (
      <>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Invoice prefix"><Input value={val("invoice_prefix") || "INV"} onChange={set("invoice_prefix")} /></Field>
          <Field label="Receipt prefix"><Input value={val("receipt_prefix") || "RCT"} onChange={set("receipt_prefix")} /></Field>
          <Field label="Quotation prefix"><Input value={val("quotation_prefix") || "QT"} onChange={set("quotation_prefix")} /></Field>
        </div>
        <Field label="Financial year starts in">
          <Select value={String(v.fy_start_month ?? 4)} onChange={set("fy_start_month")}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </Select>
        </Field>
        <p className="text-xs text-muted">Currency: Indian Rupee (₹)</p>
      </>
    ) },
  ];

  async function submit() {
    setBusy(true); setMsg("");
    try { const r = await onSubmit(v); if (r) setMsg(r); } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  }

  if (wizard) {
    const s = sections[step];
    const last = step === sections.length - 1;
    return (
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); last ? submit() : setStep(step + 1); }}>
        <div className="flex gap-1">{sections.map((_, i) => <div key={i} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-brand" : "bg-line"}`} />)}</div>
        <h2 className="font-semibold">{s.title}</h2>
        <div className="space-y-3">{s.body}</div>
        <div className="flex gap-2 pt-2">
          {step > 0 && <Button type="button" variant="secondary" onClick={() => setStep(step - 1)}>Back</Button>}
          <Button className="flex-1" disabled={busy || (step === 0 && !val("name"))}>{last ? (busy ? "Setting up…" : submitLabel) : "Next"}</Button>
        </div>
        {step > 0 && !last && <button type="button" onClick={() => setStep(step + 1)} className="w-full text-sm text-muted">Skip for now</button>}
        {msg && <p className="text-sm text-bad">{msg}</p>}
      </form>
    );
  }
  return (
    <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      {sections.map((s) => (
        <div key={s.title} className="space-y-3">
          <h3 className="text-sm font-semibold">{s.title}</h3>
          {s.body}
        </div>
      ))}
      <div className="flex items-center gap-3">
        <Button disabled={busy}>{busy ? "Saving…" : submitLabel}</Button>
        {msg && <span className="text-sm text-muted">{msg}</span>}
      </div>
    </form>
  );
}
