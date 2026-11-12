import { notFound } from "next/navigation";
import { sb } from "@/lib/supabase";
import { getCompany, normInvoice } from "@/lib/db";
import { InvoiceDoc } from "@/components/invoice-doc";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

export default async function SharedInvoice({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{24}$/.test(token)) notFound();
  const { data } = await sb().from("invoices").select("*").eq("share_token", token).is("deleted_at", null).maybeSingle();
  if (!data) notFound();
  const inv = normInvoice(data);
  const [company, party, project] = await Promise.all([
    getCompany(inv.company_id),
    inv.party_id ? sb().from("parties").select("*").eq("id", inv.party_id).single().then((r) => r.data) : null,
    inv.project_id ? sb().from("projects").select("*").eq("id", inv.project_id).single().then((r) => r.data) : null,
  ]);
  return (
    <main className="min-h-dvh bg-stone-100 p-3 sm:p-8">
      <div className="no-print mx-auto mb-3 flex max-w-3xl justify-end"><PrintButton label="Download PDF" /></div>
      <InvoiceDoc inv={inv} company={company} party={party} project={project} />
    </main>
  );
}
