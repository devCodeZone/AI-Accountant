import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCompany } from "@/lib/session";
import { loadBook } from "@/lib/db";
import { indexBook, projectStats } from "@/lib/ledger";
import { can } from "@/lib/permissions";
import { dmy, inr } from "@/lib/format";
import { Badge, LinkButton, Money, PageHeader, Section, Stat, Table, Td } from "@/components/ui";
import { TxnTable } from "@/components/txn-list";
import { HBarChart } from "@/components/charts";
import { ProjectEditor } from "./editor";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireCompany();
  const { id } = await params;
  const b = await loadBook(s.company_id);
  const x = projectStats(b).find((p) => p.project.id === id);
  if (!x) notFound();
  const ix = indexBook(b);
  const fin = can.viewFinancials(s.role);
  const entries = b.txns.filter((t) => t.project_id === id).reverse();
  const site = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const expenseCats = b.categories.filter((c) => c.kind === "expense").map((c) => ({ id: c.id, name: c.name, group: c.group_name }));
  return (
    <div className="space-y-4">
      <PageHeader title={x.project.name} subtitle={<>{x.client ? <Link href={`/parties/${x.client.id}`} className="text-brand">{x.client.name}</Link> : "No client"} · {x.project.site_address ?? ""} {x.project.start_date && `· started ${dmy(x.project.start_date)}`}</>}
        actions={fin ? <>
          {can.documents(s.role) && <LinkButton href={`/invoices/new?project=${id}`} size="sm">New invoice</LinkButton>}
          <LinkButton href={`/share/project/${x.project.share_token}`} target="_blank" size="sm">Client statement ↗</LinkButton>
        </> : undefined} />
      {fin && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Contract (quoted + extra)" value={inr(x.contract)} sub={x.extra ? `incl. extra ${inr(x.extra)}` : undefined} />
            <Stat label="Received" value={inr(x.received)} tone="good" sub={`${inr(x.pendingFromClient)} to collect`} />
            <Stat label="Spent" value={inr(x.spent)} tone="bad" sub={x.budgetTotal ? `budget ${inr(x.budgetTotal)}` : undefined} />
            <Stat label="Expected profit" value={inr(x.expectedProfit)} sub={`${x.expectedMargin}% · cash profit now ${inr(x.profit)}`} tone={x.health === "green" ? "good" : x.health === "amber" ? "warn" : "bad"} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Spent by type">
              <HBarChart data={Object.entries(x.spentByGroup).map(([name, value]) => ({ name, value }))} color="#dc2626" />
            </Section>
            <Section title="Budget vs actual">
              {x.budgetRows.length ? (
                <Table head={["Category", "Budget", "Actual", ""]}>
                  {x.budgetRows.map((r) => (
                    <tr key={r.category_id}><Td>{r.category}</Td><Td className="text-right"><Money v={r.budget} /></Td><Td className="text-right"><Money v={r.actual} /></Td><Td>{r.over ? <Badge tone="bad">Over by {inr(r.actual - r.budget)}</Badge> : <Badge tone="good">{Math.round((r.actual / (r.budget || 1)) * 100)}%</Badge>}</Td></tr>
                  ))}
                </Table>
              ) : <p className="text-sm text-muted">No budget set. Add one below to get overrun alerts.</p>}
            </Section>
          </div>
        </>
      )}
      {can.editEntries(s.role) && <ProjectEditor project={x.project} stages={x.stages} expenseCats={expenseCats} />}
      {!can.editEntries(s.role) && fin && (
        <Section title="Milestones">
          <Table head={["Stage", "Amount", "Due", "Status"]}>
            {x.stages.map((st) => <tr key={st.id}><Td>{st.name}{st.is_extra && <Badge className="ml-1">extra</Badge>}</Td><Td className="text-right"><Money v={st.amount} /></Td><Td>{dmy(st.due_date)}</Td><Td>{st.status}</Td></tr>)}
          </Table>
        </Section>
      )}
      <Section title={`Entries (${entries.length})`} action={can.addEntries(s.role) ? <Link href="/add" className="text-xs text-brand">+ Add</Link> : undefined}>
        <TxnTable rows={entries.map((t) => ({ t }))} ix={ix} />
      </Section>
      <p className="text-xs text-muted">Client statement link: {site}/share/project/{x.project.share_token} — anyone with the link can view received payments and pending amounts (not your costs).</p>
    </div>
  );
}
