import Link from "next/link";
import { requireCompany } from "@/lib/session";
import { loadBook } from "@/lib/db";
import { filterTxns, findDuplicates, indexBook, isPL } from "@/lib/ledger";
import { inr } from "@/lib/format";
import { Card, Input, LinkButton, PageHeader, Select } from "@/components/ui";
import { TxnTable } from "@/components/txn-list";
import { can } from "@/lib/permissions";

type SP = { q?: string; from?: string; to?: string; project?: string; party?: string; category?: string; nobill?: string; dups?: string };

export default async function Transactions({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await requireCompany();
  const sp = await searchParams;
  const b = await loadBook(s.company_id);
  const ix = indexBook(b);
  let rows = filterTxns(b, sp);
  if (s.role === "staff") rows = rows.filter((t) => t.created_by === s.uid);
  if (sp.nobill) rows = rows.filter((t) => t.entry_type === "money" && t.direction === "out" && t.mode === "cash" && t.amount >= 2000 && !t.attachments.length && isPL(t, ix));
  if (sp.dups) { const ids = new Set(findDuplicates(rows).flat().map((t) => t.id)); rows = rows.filter((t) => ids.has(t.id)); }
  rows = [...rows].reverse();
  const shown = rows.slice(0, 300);
  const tin = rows.filter((t) => t.entry_type === "money" && t.direction === "in").reduce((s, t) => s + t.amount, 0);
  const tout = rows.filter((t) => t.entry_type === "money" && t.direction === "out").reduce((s, t) => s + t.amount, 0);
  return (
    <div className="space-y-4">
      <PageHeader title={s.role === "staff" ? "My entries" : "All entries"} subtitle={`${rows.length} entries · in ${inr(tin)} · out ${inr(tout)}${sp.nobill ? " · cash payments without bill photo" : ""}${sp.dups ? " · possible duplicates" : ""}`}
        actions={<>{can.addEntries(s.role) && <LinkButton href="/add" variant="primary">+ Add</LinkButton>}{can.export(s.role) && <LinkButton href="/api/export/excel">Excel</LinkButton>}</>} />
      <form className="no-print flex flex-wrap gap-2 rounded-2xl border border-line bg-white p-3 text-sm">
        <Input name="q" placeholder="Search notes, bill no, party…" defaultValue={sp.q} className="w-full sm:w-56" />
        <Input type="date" name="from" defaultValue={sp.from} className="w-auto" />
        <Input type="date" name="to" defaultValue={sp.to} className="w-auto" />
        <Select name="project" defaultValue={sp.project ?? ""} className="w-auto max-w-[12rem]"><option value="">All projects</option>{b.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        <Select name="category" defaultValue={sp.category ?? ""} className="w-auto max-w-[12rem]"><option value="">All categories</option>{b.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Select name="party" defaultValue={sp.party ?? ""} className="w-auto max-w-[12rem]"><option value="">All parties</option>{b.parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        <button className="h-10 rounded-xl bg-ink px-4 text-white">Filter</button>
        <Link href="/transactions" className="h-10 px-2 leading-10 text-muted">Clear</Link>
      </form>
      <Card className="p-2"><TxnTable rows={shown.map((t) => ({ t }))} ix={ix} /></Card>
      {rows.length > 300 && <p className="text-center text-xs text-muted">Showing latest 300 — narrow the filter or export to Excel for all.</p>}
    </div>
  );
}
