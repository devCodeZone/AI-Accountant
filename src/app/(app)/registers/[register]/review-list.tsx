"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Badge } from "@/components/ui";
import { EntryForm, type RefsLite } from "@/components/entry-form";
import type { DraftEntry, Txn } from "@/lib/types";
import { dmy } from "@/lib/format";

export function txnToDraft(t: Txn): DraftEntry {
  return {
    key: t.id, txn_date: t.txn_date, amount: t.amount, direction: t.direction, entry_type: t.entry_type, mode: t.mode,
    account_id: t.account_id, party_id: t.party_id, party_name: null, party_type: null, party_trade: null,
    project_id: t.project_id, project_name: null, category_id: t.category_id, sub_category: t.sub_category,
    gst_rate: t.gst_rate, gst_amount: t.gst_amount, tds_amount: t.tds_amount, bill_no: t.bill_no, reference: t.reference,
    due_date: t.due_date, settles_bill: t.settles_bill, notes: t.notes, attachments: t.attachments, source: t.source,
    is_approximate: t.is_approximate, is_transfer: false, confidence: t.ai_confidence ?? 1, question: null,
  };
}

export const draftPatch = (d: DraftEntry) => ({
  txn_date: d.txn_date, amount: d.amount, direction: d.direction, entry_type: d.entry_type, mode: d.entry_type === "money" ? d.mode : null,
  account_id: d.entry_type === "money" ? d.account_id : null, party_id: d.party_id, project_id: d.project_id, category_id: d.category_id,
  sub_category: d.sub_category, gst_rate: d.gst_rate, gst_amount: d.gst_amount, tds_amount: d.tds_amount, bill_no: d.bill_no,
  reference: d.reference, due_date: d.due_date, settles_bill: d.settles_bill, notes: d.notes, attachments: d.attachments, is_approximate: d.is_approximate,
});

export function ReviewList({ items, refs, canConfirm }: { items: Txn[]; refs: RefsLite; canConfirm: boolean }) {
  const r = useRouter();
  const [drafts, setDrafts] = useState(() => items.map(txnToDraft));
  const [busy, setBusy] = useState<string | null>(null);

  async function act(d: DraftEntry, action: "confirm" | "save" | "delete") {
    setBusy(d.key);
    try {
      const res = action === "delete"
        ? await fetch(`/api/transactions/${d.key}`, { method: "DELETE" })
        : await fetch(`/api/transactions/${d.key}`, { method: "PATCH", headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...draftPatch(d), ...(action === "confirm" ? { status: "confirmed", is_approximate: false } : {}) }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      if (action !== "save") setDrafts((x) => x.filter((y) => y.key !== d.key));
      r.refresh();
    } catch (e: any) { alert(e.message); } finally { setBusy(null); }
  }

  return (
    <div className="space-y-3">
      {drafts.map((d, i) => {
        const orig = items.find((t) => t.id === d.key)!;
        return (
          <Card key={d.key} className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <Badge>{orig.source}</Badge>{orig.is_approximate && <Badge tone="warn">Approximate</Badge>}
              {orig.ai_confidence != null && <Badge tone={orig.ai_confidence >= 0.8 ? "good" : "warn"}>{Math.round(orig.ai_confidence * 100)}% sure</Badge>}
              <span className="text-muted">added {dmy(orig.created_at.slice(0, 10))}</span>
            </div>
            {orig.notes && <p className="text-sm italic text-muted">“{orig.notes}”</p>}
            <EntryForm value={d} refs={refs} compact onChange={(nd) => setDrafts((x) => x.map((y, j) => (j === i ? nd : y)))} />
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" disabled={busy === d.key} onClick={() => confirm("Delete this entry?") && act(d, "delete")}>Delete</Button>
              <Button variant="secondary" size="sm" disabled={busy === d.key} onClick={() => act(d, "save")}>Save changes</Button>
              {canConfirm && <Button size="sm" className="ml-auto" disabled={busy === d.key} onClick={() => act(d, "confirm")}>✓ Confirm</Button>}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
