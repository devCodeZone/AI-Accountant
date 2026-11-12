"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { STATES, computeInvoice, HSN_HINTS } from "@/lib/gst";
import { todayISO, addDays, inr, amountInWords } from "@/lib/format";
import type { InvoiceItem } from "@/lib/types";

type Opt = { id: string; name: string };
const blank = (gst: number): InvoiceItem => ({ description: "", hsn_sac: "995432", qty: 1, unit: "job", rate: 0, gst_rate: gst });

export function InvoiceForm({ type, gstOn, companyState, clients, projects, stages, initial }: {
  type: "invoice" | "quotation" | "receipt"; gstOn: boolean; companyState: string | null;
  clients: (Opt & { state: string | null })[]; projects: (Opt & { client_id: string | null; quoted_value: number })[];
  stages: { id: string; project_id: string; name: string; amount: number; status: string; due_date: string | null }[];
  initial: { project_id: string; party_id: string; stage_id: string; transaction_id: string; items?: InvoiceItem[]; doc_date?: string };
}) {
  const r = useRouter();
  const gst = gstOn && type !== "receipt";
  const [v, setV] = useState({
    party_id: initial.party_id, project_id: initial.project_id, stage_id: initial.stage_id,
    doc_date: initial.doc_date ?? todayISO(), due_date: type === "invoice" ? addDays(todayISO(), 7) : "",
    place_of_supply: companyState ?? "", notes: "", terms: type === "quotation" ? "Valid for 15 days. 50% advance to start work." : "",
  });
  const [items, setItems] = useState<InvoiceItem[]>(() => {
    if (initial.items) return initial.items;
    const st = stages.find((s) => s.id === initial.stage_id);
    if (st) {
      const g = gst ? 18 : 0;
      const p = projects.find((x) => x.id === st.project_id);
      return [{ ...blank(g), description: `${p?.name ?? ""} — ${st.name}`, rate: gst ? Math.round((st.amount / 1.18) * 100) / 100 : st.amount }];
    }
    return [blank(gst ? 18 : 0)];
  });
  const [busy, setBusy] = useState(false);
  const totals = useMemo(() => computeInvoice(items, companyState, v.place_of_supply, gst), [items, companyState, v.place_of_supply, gst]);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const projStages = stages.filter((s) => s.project_id === v.project_id && s.status === "pending");

  function pickStage(id: string) {
    setV((x) => ({ ...x, stage_id: id }));
    const st = stages.find((s) => s.id === id);
    if (st) {
      const p = projects.find((x) => x.id === st.project_id);
      setItems([{ ...blank(gst ? 18 : 0), description: `${p?.name ?? ""} — ${st.name}`, rate: gst ? Math.round((st.amount / 1.18) * 100) / 100 : st.amount }]);
      if (st.due_date) setV((x) => ({ ...x, stage_id: id, due_date: st.due_date! }));
    }
  }

  async function submit() {
    setBusy(true);
    const res = await fetch("/api/invoices", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...v, doc_type: type, items, transaction_id: initial.transaction_id || undefined }) });
    const j = await res.json(); setBusy(false);
    if (!res.ok) return alert(j.error);
    r.push(`/invoices/${j.id}`);
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Client">
          <Select value={v.party_id} onChange={(e) => {
            const c = clients.find((x) => x.id === e.target.value);
            setV((x) => ({ ...x, party_id: e.target.value, place_of_supply: c?.state ?? x.place_of_supply }));
          }}><option value="">Choose client…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        </Field>
        <Field label="Project">
          <Select value={v.project_id} onChange={(e) => { const p = projects.find((x) => x.id === e.target.value); setV((x) => ({ ...x, project_id: e.target.value, party_id: x.party_id || p?.client_id || "" })); }}>
            <option value="">—</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        {type === "invoice" && projStages.length > 0 && (
          <Field label="Bill a milestone stage"><Select value={v.stage_id} onChange={(e) => pickStage(e.target.value)}><option value="">—</option>{projStages.map((s) => <option key={s.id} value={s.id}>{s.name} · {inr(s.amount)}</option>)}</Select></Field>
        )}
        <Field label="Date"><Input type="date" value={v.doc_date} onChange={set("doc_date")} /></Field>
        {type !== "receipt" && <Field label={type === "quotation" ? "Valid till" : "Due date"}><Input type="date" value={v.due_date} onChange={set("due_date")} /></Field>}
        {gst && <Field label="Place of supply" hint={totals.inter ? "Other state → IGST" : "Same state → CGST + SGST"}><Select value={v.place_of_supply} onChange={set("place_of_supply")}>{STATES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</Select></Field>}
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium text-muted">Items</div>
        {items.map((it, i) => {
          const up = (p: Partial<InvoiceItem>) => setItems((x) => x.map((y, j) => (j === i ? { ...y, ...p } : y)));
          return (
            <div key={i} className="grid grid-cols-12 gap-1.5 rounded-xl border border-line p-2">
              <Input className="col-span-12" placeholder="Description" value={it.description} onChange={(e) => up({ description: e.target.value })} />
              {gst && <Input className="col-span-4 sm:col-span-2" list="hsn" placeholder="HSN/SAC" value={it.hsn_sac ?? ""} onChange={(e) => up({ hsn_sac: e.target.value })} />}
              <Input className="col-span-3 sm:col-span-2" inputMode="decimal" placeholder="Qty" value={it.qty || ""} onChange={(e) => up({ qty: Number(e.target.value) || 0 })} />
              <Input className="col-span-5 sm:col-span-2" placeholder="Unit" value={it.unit ?? ""} onChange={(e) => up({ unit: e.target.value })} />
              <Input className="col-span-6 sm:col-span-3" inputMode="decimal" placeholder="Rate (before GST)" value={it.rate || ""} onChange={(e) => up({ rate: Number(e.target.value) || 0 })} />
              {gst && <Select className="col-span-4 sm:col-span-2" value={it.gst_rate} onChange={(e) => up({ gst_rate: Number(e.target.value) })}>{[0, 5, 12, 18, 28].map((g) => <option key={g} value={g}>{g}%</option>)}</Select>}
              <button className="col-span-2 sm:col-span-1 text-muted" onClick={() => setItems((x) => x.filter((_, j) => j !== i))}>✕</button>
            </div>
          );
        })}
        <datalist id="hsn">{HSN_HINTS.map((h) => <option key={h.code} value={h.code}>{h.label}</option>)}</datalist>
        <button className="text-sm text-brand" onClick={() => setItems((x) => [...x, blank(gst ? 18 : 0)])}>+ Add item</button>
      </div>

      <div className="rounded-xl bg-stone-50 p-3 text-sm tabular">
        <div className="flex justify-between"><span>Subtotal</span><span>{inr(totals.subtotal, true)}</span></div>
        {totals.cgst > 0 && <div className="flex justify-between"><span>CGST</span><span>{inr(totals.cgst, true)}</span></div>}
        {totals.sgst > 0 && <div className="flex justify-between"><span>SGST</span><span>{inr(totals.sgst, true)}</span></div>}
        {totals.igst > 0 && <div className="flex justify-between"><span>IGST</span><span>{inr(totals.igst, true)}</span></div>}
        <div className="mt-1 flex justify-between border-t border-line pt-1 font-semibold"><span>Total</span><span>{inr(totals.total, true)}</span></div>
        <div className="mt-1 text-xs text-muted">{amountInWords(totals.total)}</div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Notes"><Textarea rows={2} value={v.notes} onChange={set("notes")} /></Field>
        <Field label="Terms"><Textarea rows={2} value={v.terms} onChange={set("terms")} /></Field>
      </div>
      <Button size="lg" className="w-full" disabled={busy || !items.length} onClick={submit}>{busy ? "Creating…" : `Create ${type}`}</Button>
    </Card>
  );
}
