import { notFound } from "next/navigation";
import { requireCompany } from "@/lib/session";
import { sb } from "@/lib/supabase";
import { getCompany, normInvoice } from "@/lib/db";
import { can } from "@/lib/permissions";
import { InvoiceDoc } from "@/components/invoice-doc";
import { InvoiceActions } from "./actions";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireCompany();
  const { id } = await params;
  const { data } = await sb().from("invoices").select("*").eq("id", id).eq("company_id", s.company_id).maybeSingle();
  if (!data) notFound();
  const inv = normInvoice(data);
  const [company, party, project] = await Promise.all([
    getCompany(s.company_id),
    inv.party_id ? sb().from("parties").select("*").eq("id", inv.party_id).single().then((r) => r.data) : null,
    inv.project_id ? sb().from("projects").select("*").eq("id", inv.project_id).single().then((r) => r.data) : null,
  ]);
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return (
    <div className="space-y-4">
      <InvoiceActions inv={inv} shareUrl={`${base}/share/invoice/${inv.share_token}`} phone={party?.phone ?? null} partyName={party?.name ?? ""} companyName={company.name} canEdit={can.documents(s.role)} />
      <InvoiceDoc inv={inv} company={company} party={party} project={project} />
    </div>
  );
}
