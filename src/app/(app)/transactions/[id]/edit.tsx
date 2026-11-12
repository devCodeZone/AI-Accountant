"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { EntryForm, type RefsLite } from "@/components/entry-form";
import { draftPatch, txnToDraft } from "../../registers/[register]/review-list";
import type { Txn } from "@/lib/types";

export function EditEntry({ t, refs, editable, canDelete }: { t: Txn; refs: RefsLite; editable: boolean; canDelete: boolean }) {
  const r = useRouter();
  const [d, setD] = useState(() => txnToDraft(t));
  const [busy, setBusy] = useState(false);
  async function call(method: "PATCH" | "DELETE", body?: object) {
    setBusy(true);
    try {
      const res = await fetch(`/api/transactions/${t.id}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      if (method === "DELETE") r.push("/transactions"); else r.refresh();
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  }
  return (
    <Card className="space-y-4 p-4">
      <fieldset disabled={!editable} className="disabled:opacity-80">
        <EntryForm value={d} onChange={setD} refs={refs} />
      </fieldset>
      <div className="flex gap-2">
        {canDelete && <Button variant="ghost" disabled={busy} onClick={() => confirm("Delete this entry? It stays in the audit log.") && call("DELETE")}>Delete</Button>}
        {editable && t.status !== "confirmed" && <Button variant="secondary" disabled={busy} onClick={() => call("PATCH", { ...draftPatch(d), status: "confirmed" })}>Confirm</Button>}
        {editable && <Button className="ml-auto" disabled={busy} onClick={() => call("PATCH", draftPatch(d))}>{busy ? "Saving…" : "Save changes"}</Button>}
      </div>
      {!editable && <p className="text-xs text-muted">View only.</p>}
    </Card>
  );
}
