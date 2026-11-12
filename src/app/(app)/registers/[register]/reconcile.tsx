"use client";
import { useState } from "react";

export function ReconcileToggle({ id, value, disabled }: { id: string; value: boolean; disabled?: boolean }) {
  const [v, setV] = useState(value);
  return (
    <input type="checkbox" checked={v} disabled={disabled} aria-label="Reconciled" onChange={async (e) => {
      const nv = e.target.checked; setV(nv);
      const res = await fetch(`/api/transactions/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ reconciled: nv }) });
      if (!res.ok) { setV(!nv); alert((await res.json()).error); }
    }} />
  );
}
