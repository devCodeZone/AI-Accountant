import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/session";
import { can } from "@/lib/permissions";
import { loadBook } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { InvoiceForm } from "./form";

export default async function NewInvoice({ searchParams }: { searchParams: Promise<{ type?: string; project?: string; stage?: string; txn?: string }> }) {
  const s = await requireCompany();
  if (!can.documents(s.role)) redirect("/invoices");
  const sp = await searchParams;
  const b = await loadBook(s.company_id);
  const txn = sp.txn ? b.txns.find((t) => t.id === sp.txn) : undefined;
  const project = b.projects.find((p) => p.id === (sp.project ?? txn?.project_id));
  const type = txn ? "receipt" : (sp.type as "invoice" | "quotation" | "receipt") ?? "invoice";
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`New ${type}`} />
      <InvoiceForm
        type={type}
        gstOn={!!b.company.gstin}
        companyState={b.company.state_code}
        clients={b.parties.filter((p) => p.type === "client").map((p) => ({ id: p.id, name: p.name, state: p.gstin?.slice(0, 2) ?? null }))}
        projects={b.projects.map((p) => ({ id: p.id, name: p.name, client_id: p.client_id, quoted_value: p.quoted_value }))}
        stages={b.stages.map((st) => ({ id: st.id, project_id: st.project_id, name: st.name, amount: st.amount, status: st.status, due_date: st.due_date }))}
        initial={{ project_id: project?.id ?? "", party_id: txn?.party_id ?? project?.client_id ?? "", stage_id: sp.stage ?? "", transaction_id: txn?.id ?? "",
          items: txn ? [{ description: `Payment received${project ? ` for ${project.name}` : ""} (${txn.mode?.toUpperCase()})`, qty: 1, rate: txn.amount, gst_rate: 0, hsn_sac: "", unit: "" }] : undefined,
          doc_date: txn?.txn_date }}
      />
    </div>
  );
}
