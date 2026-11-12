"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import type { Invoice } from "@/lib/types";

export function InvoiceActions({ inv, shareUrl, phone, partyName, companyName, canEdit }: { inv: Invoice; shareUrl: string; phone: string | null; partyName: string; companyName: string; canEdit: boolean }) {
  const r = useRouter();
  const [url, setUrl] = useState(shareUrl);
  useEffect(() => { if (!shareUrl.startsWith("http")) setUrl(window.location.origin + shareUrl); }, [shareUrl]);
  const digits = (phone ?? "").replace(/\D/g, "");
  const text = `Namaste ${partyName} ji, please find ${inv.doc_type} ${inv.number} for ₹${Math.round(inv.total).toLocaleString("en-IN")} from ${companyName}: ${url}`;
  const wa = `https://wa.me/${digits.length === 10 ? "91" + digits : digits}?text=${encodeURIComponent(text)}`;
  const status = async (s: string) => {
    const res = await fetch(`/api/invoices/${inv.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: s }) });
    if (!res.ok) return alert((await res.json()).error); r.refresh();
  };
  const convert = async () => {
    const res = await fetch("/api/invoices", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ doc_type: "invoice", party_id: inv.party_id, project_id: inv.project_id, items: inv.items, notes: inv.notes, terms: inv.terms, place_of_supply: inv.place_of_supply }) });
    const j = await res.json(); if (!res.ok) return alert(j.error); r.push(`/invoices/${j.id}`);
  };
  return (
    <div className="no-print flex flex-wrap gap-2">
      <Button variant="secondary" onClick={() => window.print()}>Print / PDF</Button>
      <a href={wa} target="_blank" className="inline-flex h-10 items-center rounded-xl bg-green-600 px-4 text-sm font-medium text-white">Share on WhatsApp</a>
      <Button variant="secondary" onClick={() => { navigator.clipboard.writeText(url); }}>Copy link</Button>
      {canEdit && inv.doc_type === "quotation" && <Button onClick={convert}>Convert to invoice</Button>}
      {canEdit && inv.doc_type === "invoice" && inv.status !== "paid" && inv.status !== "cancelled" && <>
        {inv.status === "draft" && <Button variant="secondary" onClick={() => status("sent")}>Mark sent</Button>}
        <Button variant="secondary" onClick={() => status("paid")}>Mark paid</Button>
        <Button variant="ghost" onClick={() => confirm("Cancel this invoice?") && status("cancelled")}>Cancel</Button>
      </>}
      {inv.doc_type === "invoice" && inv.status !== "paid" && <p className="w-full text-xs text-muted">Marking paid only changes the invoice status. Record the money itself with + Add (Received) so the books update.</p>}
    </div>
  );
}
