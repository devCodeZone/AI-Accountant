import Link from "next/link";
import { requireCompany } from "@/lib/session";
import { loadBook } from "@/lib/db";
import { projectStats } from "@/lib/ledger";
import { can } from "@/lib/permissions";
import { inr } from "@/lib/format";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { NewProject } from "./new-project";

const tone = { green: "good", amber: "warn", red: "bad" } as const;

export default async function Projects() {
  const s = await requireCompany();
  const b = await loadBook(s.company_id);
  const stats = projectStats(b);
  const fin = can.viewFinancials(s.role);
  return (
    <div className="space-y-4">
      <PageHeader title="Project accounts" subtitle="Quoted vs received vs spent for every site" actions={can.editEntries(s.role) ? <NewProject clients={b.parties.filter((p) => p.type === "client").map((p) => ({ id: p.id, name: p.name }))} /> : undefined} />
      {!stats.length && <Empty title="No projects yet">Add your first project to track its money.</Empty>}
      <div className="grid gap-3 md:grid-cols-2">
        {stats.map((x) => (
          <Link key={x.project.id} href={`/projects/${x.project.id}`}>
            <Card className="h-full p-4 hover:border-brand">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><div className="truncate font-semibold">{x.project.name}</div><div className="text-xs text-muted">{x.client?.name ?? "No client"} · {x.project.status.replace("_", " ")}</div></div>
                {fin && <Badge tone={tone[x.health]}>{x.expectedMargin}% margin</Badge>}
              </div>
              {fin && (
                <>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-sm tabular">
                    <div><div className="text-xs text-muted">Contract</div>{inr(x.contract)}</div>
                    <div><div className="text-xs text-muted">Received</div><span className="text-good">{inr(x.received)}</span></div>
                    <div><div className="text-xs text-muted">Spent</div><span className="text-bad">{inr(x.spent)}</span></div>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-stone-100">
                    <div className="h-full bg-brand" style={{ width: `${Math.min(100, x.contract ? (x.received / x.contract) * 100 : 0)}%` }} />
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-muted"><span>{inr(x.pendingFromClient)} still to collect</span>{x.overrun && <span className="text-bad">Over budget</span>}</div>
                </>
              )}
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
