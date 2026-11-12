"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Input, Select } from "@/components/ui";

export function NewProject({ clients }: { clients: { id: string; name: string }[] }) {
  const r = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Record<string, string>>({ status: "active" });
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  if (!open) return <Button onClick={() => setOpen(true)}>+ New project</Button>;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-4" onClick={() => setOpen(false)}>
      <Card className="w-full max-w-md space-y-3 rounded-b-none p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-semibold">New project</h2>
        <Field label="Project / site name *"><Input value={v.name ?? ""} onChange={set("name")} placeholder="e.g. Sharma – Sector 56 3BHK" /></Field>
        <Field label="Client">
          <Select value={v.client_id ?? ""} onChange={set("client_id")}>
            <option value="">+ New client (type below)</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        {!v.client_id && <div className="grid grid-cols-2 gap-3"><Field label="Client name"><Input value={v.client_name ?? ""} onChange={set("client_name")} /></Field><Field label="Client phone"><Input value={v.client_phone ?? ""} onChange={set("client_phone")} inputMode="tel" /></Field></div>}
        <Field label="Site address"><Input value={v.site_address ?? ""} onChange={set("site_address")} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quoted value (₹)"><Input inputMode="numeric" value={v.quoted_value ?? ""} onChange={set("quoted_value")} /></Field>
          <Field label="Start date"><Input type="date" value={v.start_date ?? ""} onChange={set("start_date")} /></Field>
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button className="flex-1" disabled={busy || !v.name} onClick={async () => {
            setBusy(true);
            const res = await fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(v) });
            const j = await res.json(); setBusy(false);
            if (!res.ok) return alert(j.error);
            r.push(`/projects/${j.id}`);
          }}>Create</Button>
        </div>
      </Card>
    </div>
  );
}
