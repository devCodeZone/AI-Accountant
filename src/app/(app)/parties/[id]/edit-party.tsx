"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { PartyFields } from "../new-party";
import type { Party } from "@/lib/types";

export function EditParty({ party }: { party: Party }) {
  const r = useRouter();
  const [v, setV] = useState<Record<string, any>>({ ...party });
  const [open, setOpen] = useState(false);
  const set = (k: string) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  if (!open) return <button className="text-sm text-brand" onClick={() => setOpen(true)}>Edit details</button>;
  return (
    <div className="max-w-md space-y-3">
      <PartyFields v={v} set={set} />
      <div className="flex gap-2">
        <Button variant="ghost" onClick={async () => { if (!confirm("Remove this party? Past entries stay.")) return; await fetch(`/api/parties/${party.id}`, { method: "DELETE" }); r.push("/parties"); }}>Remove</Button>
        <Button className="ml-auto" onClick={async () => {
          const res = await fetch(`/api/parties/${party.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(v) });
          if (!res.ok) return alert((await res.json()).error); setOpen(false); r.refresh();
        }}>Save</Button>
      </div>
    </div>
  );
}
