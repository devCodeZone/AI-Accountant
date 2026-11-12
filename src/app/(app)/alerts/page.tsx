import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/session";
import { can } from "@/lib/permissions";
import { loadBook } from "@/lib/db";
import { alerts } from "@/lib/ledger";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";

const tone = { high: "bad", medium: "warn", low: "neutral" } as const;

export default async function Alerts() {
  const s = await requireCompany();
  if (!can.viewFinancials(s.role)) redirect("/transactions");
  const b = await loadBook(s.company_id);
  const list = alerts(b);
  return (
    <div className="space-y-4">
      <PageHeader title="Smart alerts" subtitle="Overdue payments, dues, overruns, missing bills, duplicates and TDS" />
      {!list.length ? <Empty title="All good — nothing needs attention" /> : (
        <Card className="divide-y divide-line">
          {list.map((a, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Badge tone={tone[a.level]}>{a.level}</Badge>
              <div className="min-w-0 flex-1">
                {a.href ? <Link href={a.href} className="font-medium">{a.title}</Link> : <div className="font-medium">{a.title}</div>}
                <div className="text-xs text-muted">{a.detail}</div>
              </div>
              {a.whatsapp && <a href={a.whatsapp} target="_blank" className="whitespace-nowrap rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white">Send reminder</a>}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
