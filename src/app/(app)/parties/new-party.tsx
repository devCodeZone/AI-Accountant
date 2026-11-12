"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Input, Select } from "@/components/ui";

export function PartyFields({ v, set }: { v: Record<string, any>; set: (k: string) => (e: { target: { value: string } }) => void }) {
  return (
    <>
      <Field label="Name *"><Input value={v.name ?? ""} onChange={set("name")} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type"><Select value={v.type ?? "client"} onChange={set("type")}><option value="client">Client</option><option value="vendor">Vendor</option><option value="labour">Labour / contractor</option><option value="other">Other</option></Select></Field>
        {v.type === "labour" ? <Field label="Trade"><Select value={v.trade ?? ""} onChange={set("trade")}><option value="">—</option>{["carpenter", "painter", "electrician", "plumber", "pop", "mason", "helper", "subcontractor"].map((t) => <option key={t}>{t}</option>)}</Select></Field>
          : <Field label="Phone"><Input inputMode="tel" value={v.phone ?? ""} onChange={set("phone")} /></Field>}
      </div>
      {v.type === "labour" && <Field label="Phone"><Input inputMode="tel" value={v.phone ?? ""} onChange={set("phone")} /></Field>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="GSTIN"><Input className="uppercase" value={v.gstin ?? ""} onChange={set("gstin")} /></Field>
        <Field label="PAN"><Input className="uppercase" value={v.pan ?? ""} onChange={set("pan")} /></Field>
      </div>
      <Field label="Address"><Input value={v.address ?? ""} onChange={set("address")} /></Field>
      <Field label="Opening balance (₹)" hint={v.type === "client" ? "Amount they already owed you" : "Amount you already owed them"}><Input inputMode="numeric" value={v.opening_balance ?? ""} onChange={set("opening_balance")} /></Field>
    </>
  );
}

export function NewParty({ type }: { type: string }) {
  const r = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Record<string, any>>({ type });
  const set = (k: string) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  if (!open) return <Button onClick={() => { setV({ type }); setOpen(true); }}>+ Add</Button>;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center sm:p-4" onClick={() => setOpen(false)}>
      <Card className="w-full max-w-md space-y-3 rounded-b-none p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <PartyFields v={v} set={set} />
        <div className="flex gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button className="flex-1" disabled={!v.name} onClick={async () => {
            const res = await fetch("/api/parties", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(v) });
            const j = await res.json(); if (!res.ok) return alert(j.error); r.push(`/parties/${j.id}`);
          }}>Save</Button></div>
      </Card>
    </div>
  );
}
