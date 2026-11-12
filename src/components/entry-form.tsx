"use client";
import { useMemo, useState } from "react";
import { Badge, Button, Field, Input, Select, Textarea, cx } from "./ui";
import type { DraftEntry, Mode } from "@/lib/types";
import { todayISO } from "@/lib/format";
import { compressImage } from "@/lib/image";

export type RefsLite = {
  gstOn: boolean;
  accounts: { id: string; name: string; type: string; is_default: boolean }[];
  categories: { id: string; name: string; group_name: string; kind: string; is_transfer: boolean }[];
  parties: { id: string; name: string; type: string; trade: string | null }[];
  projects: { id: string; name: string; status: string }[];
};

export type Kind = "in" | "out" | "transfer" | "vendor_bill" | "labour_work";

export function blankDraft(over: Partial<DraftEntry> = {}): DraftEntry {
  return {
    key: Math.random().toString(36).slice(2), txn_date: todayISO(), amount: 0, direction: "out", entry_type: "money",
    mode: "cash", account_id: null, party_id: null, party_name: null, party_type: null, party_trade: null,
    project_id: null, project_name: null, category_id: null, sub_category: null, gst_rate: null, gst_amount: 0, tds_amount: 0,
    bill_no: null, reference: null, due_date: null, settles_bill: false, notes: null, attachments: [], source: "manual",
    is_approximate: false, is_transfer: false, to_account_id: null, confidence: 1, question: null, ...over,
  };
}

export function kindOf(d: DraftEntry): Kind {
  if (d.is_transfer) return "transfer";
  if (d.entry_type === "vendor_bill") return "vendor_bill";
  if (d.entry_type === "labour_work") return "labour_work";
  return d.direction;
}

const KINDS: { k: Kind; label: string }[] = [
  { k: "out", label: "Paid out" }, { k: "in", label: "Received" }, { k: "transfer", label: "Cash ⇄ Bank" },
  { k: "vendor_bill", label: "Bill (credit)" }, { k: "labour_work", label: "Labour work done" },
];
const MODES: Mode[] = ["cash", "upi", "bank", "cheque", "card"];

export function EntryForm({ value, onChange, refs, compact }: { value: DraftEntry; onChange: (d: DraftEntry) => void; refs: RefsLite; compact?: boolean }) {
  const d = value;
  const set = (p: Partial<DraftEntry>) => onChange({ ...d, ...p });
  const kind = kindOf(d);
  const [uploading, setUploading] = useState(false);
  const [more, setMore] = useState(!compact);

  const setKind = (k: Kind) => {
    if (k === "transfer") set({ is_transfer: true, entry_type: "money", direction: "out", party_id: null, party_name: null, mode: d.mode ?? "cash", category_id: refs.categories.find((c) => c.is_transfer)?.id ?? null });
    else if (k === "vendor_bill" || k === "labour_work") set({ is_transfer: false, entry_type: k, direction: "out", mode: null, account_id: null });
    else set({ is_transfer: false, entry_type: "money", direction: k, mode: d.mode ?? "cash" });
  };

  const cats = useMemo(() => {
    const list = refs.categories.filter((c) => !c.is_transfer && (kind === "in" ? c.kind !== "expense" : c.kind !== "income"));
    const groups = new Map<string, typeof list>();
    for (const c of list) groups.set(c.group_name, [...(groups.get(c.group_name) ?? []), c]);
    return [...groups];
  }, [refs.categories, kind]);

  const accounts = refs.accounts.filter((a) => (d.mode === "cash" ? a.type === "cash" : a.type !== "cash"));
  const partyMatch = refs.parties.find((p) => p.id === d.party_id);
  const partyText = partyMatch?.name ?? d.party_name ?? "";
  const isVendor = partyMatch?.type === "vendor";

  async function onFile(f: File | undefined) {
    if (!f) return;
    setUploading(true);
    try {
      const blob = f.type.startsWith("image/") ? await compressImage(f) : f;
      const fd = new FormData();
      fd.append("file", blob, f.name);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      set({ attachments: [...d.attachments, j.path] });
    } catch (e: any) { alert(e.message); } finally { setUploading(false); }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {KINDS.map(({ k, label }) => (
          <button key={k} type="button" onClick={() => setKind(k)}
            className={cx("rounded-full border px-3 py-1 text-xs", kind === k ? "border-brand bg-brand text-white" : "border-line bg-white")}>{label}</button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (₹)">
          <Input inputMode="decimal" value={d.amount || ""} onChange={(e) => set({ amount: Number(e.target.value.replace(/[^\d.]/g, "")) })} placeholder="0" className="text-lg font-semibold" />
        </Field>
        <Field label="Date">
          <Input type="date" value={d.txn_date} onChange={(e) => set({ txn_date: e.target.value })} />
        </Field>
      </div>

      {(kind === "in" || kind === "out" || kind === "transfer") && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {MODES.map((m) => (
              <button key={m} type="button" onClick={() => set({ mode: m, account_id: null })}
                className={cx("rounded-lg border px-3 py-1 text-xs uppercase", d.mode === m ? "border-ink bg-ink text-white" : "border-line")}>{m}</button>
            ))}
          </div>
          {kind === "transfer" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="From"><AccountSelect accounts={refs.accounts} value={d.account_id} onChange={(id) => set({ account_id: id })} /></Field>
              <Field label="To"><AccountSelect accounts={refs.accounts} value={d.to_account_id ?? null} onChange={(id) => set({ to_account_id: id })} /></Field>
            </div>
          ) : accounts.length > 1 && (
            <Field label="Account"><AccountSelect accounts={accounts} value={d.account_id} onChange={(id) => set({ account_id: id })} /></Field>
          )}
        </div>
      )}

      {kind !== "transfer" && (
        <>
          <Field label={kind === "in" ? "Received from" : kind === "labour_work" ? "Contractor / worker" : "Paid to"}>
            <Input list="party-list" value={partyText} placeholder="Type a name" onChange={(e) => {
              const text = e.target.value;
              const m = refs.parties.find((p) => p.name.toLowerCase() === text.trim().toLowerCase());
              set(m ? { party_id: m.id, party_name: m.name } : { party_id: null, party_name: text || null });
            }} />
            <datalist id="party-list">{refs.parties.map((p) => <option key={p.id} value={p.name}>{p.type}</option>)}</datalist>
          </Field>
          {!d.party_id && d.party_name && (
            <div className="flex items-center gap-2 text-xs">
              <Badge tone="brand">New</Badge>
              <Select className="h-8 w-auto text-xs" value={d.party_type ?? (kind === "in" ? "client" : kind === "labour_work" ? "labour" : "vendor")} onChange={(e) => set({ party_type: e.target.value as any })}>
                <option value="client">Client</option><option value="vendor">Vendor</option><option value="labour">Labour / contractor</option><option value="other">Other</option>
              </Select>
              {(d.party_type === "labour" || kind === "labour_work") && (
                <Select className="h-8 w-auto text-xs" value={d.party_trade ?? ""} onChange={(e) => set({ party_trade: e.target.value || null })}>
                  <option value="">Trade…</option>
                  {["carpenter", "painter", "electrician", "plumber", "pop", "mason", "helper", "subcontractor"].map((t) => <option key={t}>{t}</option>)}
                </Select>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Project / site">
              <Select value={d.project_id ?? ""} onChange={(e) => set({ project_id: e.target.value || null })}>
                <option value="">{d.project_name ? `"${d.project_name}" (not matched)` : "No project (office)"}</option>
                {refs.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Category">
              <Select value={d.category_id ?? ""} onChange={(e) => set({ category_id: e.target.value || null })}>
                <option value="">Choose…</option>
                {cats.map(([g, list]) => <optgroup key={g} label={g}>{list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>)}
              </Select>
            </Field>
          </div>
        </>
      )}

      {kind === "out" && isVendor && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!d.settles_bill} onChange={(e) => set({ settles_bill: e.target.checked })} />
          This pays an earlier bill (bought on credit)
        </label>
      )}

      {compact && !more ? (
        <button type="button" className="text-xs text-brand" onClick={() => setMore(true)}>+ GST, bill no., notes, photo</button>
      ) : (
        <div className="space-y-3">
          {refs.gstOn && kind !== "transfer" && kind !== "labour_work" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="GST rate %">
                <Select value={d.gst_rate ?? ""} onChange={(e) => {
                  const r = e.target.value === "" ? null : Number(e.target.value);
                  set({ gst_rate: r, gst_amount: r ? Math.round((d.amount * r) / (100 + r) * 100) / 100 : 0 });
                }}>
                  <option value="">No GST</option>{[5, 12, 18, 28].map((r) => <option key={r} value={r}>{r}%</option>)}
                </Select>
              </Field>
              <Field label="GST amount (incl. in total)"><Input inputMode="decimal" value={d.gst_amount || ""} onChange={(e) => set({ gst_amount: Number(e.target.value) || 0 })} /></Field>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bill / invoice no."><Input value={d.bill_no ?? ""} onChange={(e) => set({ bill_no: e.target.value || null })} /></Field>
            {kind === "vendor_bill"
              ? <Field label="Pay by (due date)"><Input type="date" value={d.due_date ?? ""} onChange={(e) => set({ due_date: e.target.value || null })} /></Field>
              : <Field label="UTR / cheque no."><Input value={d.reference ?? ""} onChange={(e) => set({ reference: e.target.value || null })} /></Field>}
          </div>
          {kind === "out" && <Field label="TDS deducted (₹)"><Input inputMode="decimal" value={d.tds_amount || ""} onChange={(e) => set({ tds_amount: Number(e.target.value) || 0 })} /></Field>}
          <Field label="Notes"><Textarea rows={2} value={d.notes ?? ""} onChange={(e) => set({ notes: e.target.value || null })} /></Field>
          <div className="flex flex-wrap items-center gap-2">
            {d.attachments.map((p) => (
              <a key={p} href={`/api/attachment?path=${encodeURIComponent(p)}`} target="_blank" className="rounded-lg border border-line px-2 py-1 text-xs">📎 proof</a>
            ))}
            <label className="cursor-pointer rounded-lg border border-dashed border-line px-3 py-1 text-xs text-muted">
              {uploading ? "Uploading…" : "Attach bill photo"}
              <input type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            <label className="ml-auto flex items-center gap-1.5 text-xs text-muted">
              <input type="checkbox" checked={d.is_approximate} onChange={(e) => set({ is_approximate: e.target.checked })} /> Approximate (from memory)
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

function AccountSelect({ accounts, value, onChange }: { accounts: RefsLite["accounts"]; value: string | null; onChange: (id: string | null) => void }) {
  return (
    <Select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Default</option>
      {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
    </Select>
  );
}

/** Confirmation card wrapper for AI/import drafts */
export function DraftCard({ draft, refs, onChange, onRemove }: { draft: DraftEntry; refs: RefsLite; onChange: (d: DraftEntry) => void; onRemove: () => void }) {
  const tone = draft.confidence >= 0.85 ? "good" : draft.confidence >= 0.6 ? "warn" : "bad";
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={tone}>{Math.round(draft.confidence * 100)}% sure</Badge>
          {draft.is_approximate && <Badge tone="warn">Approximate</Badge>}
          {draft.duplicate_of && <Badge tone="bad">Possible duplicate</Badge>}
          {draft.match_txn_id && <Badge tone="good">Matches existing entry</Badge>}
          <Badge>{draft.source.replace("_", " ")}</Badge>
        </div>
        <button type="button" onClick={onRemove} className="text-xs text-muted hover:text-bad">Discard</button>
      </div>
      {draft.question && <div className="mb-3 rounded-xl bg-amber-50 p-2.5 text-sm text-amber-900">❓ {draft.question}</div>}
      {draft.line_items && draft.line_items.length > 0 && (
        <details className="mb-3 text-xs text-muted">
          <summary className="cursor-pointer">{draft.line_items.length} line items read from the bill</summary>
          <ul className="mt-1 space-y-0.5">{draft.line_items.map((l, i) => <li key={i}>{l.description} {l.qty ? `× ${l.qty}` : ""} {l.amount ? `— ₹${l.amount}` : ""}</li>)}</ul>
        </details>
      )}
      <EntryForm value={draft} onChange={onChange} refs={refs} compact />
    </div>
  );
}

export function SaveBar({ count, busy, onSave }: { count: number; busy: boolean; onSave: (status: "confirmed" | "needs_review") => void }) {
  if (!count) return null;
  return (
    <div className="sticky bottom-20 z-10 flex gap-2 rounded-2xl border border-line bg-white p-2 shadow-lg md:bottom-4">
      <Button variant="secondary" className="flex-1" disabled={busy} onClick={() => onSave("needs_review")}>Save for review</Button>
      <Button className="flex-1" disabled={busy} onClick={() => onSave("confirmed")}>{busy ? "Saving…" : `Confirm ${count > 1 ? `all ${count}` : ""}`}</Button>
    </div>
  );
}
