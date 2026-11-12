import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getRefs } from "@/lib/refs";
import { PageHeader } from "@/components/ui";
import { ImportClient } from "./client";

export default async function ImportPage() {
  const s = await requireCompany();
  if (!can.editEntries(s.role)) redirect("/dashboard");
  const refs = await getRefs(s.company_id);
  return (
    <div className="space-y-4">
      <PageHeader title="Import" subtitle="Bank statements (PDF / Excel / CSV) or your existing Excel ledger — always previewed before saving" />
      <ImportClient refs={refs} />
    </div>
  );
}
