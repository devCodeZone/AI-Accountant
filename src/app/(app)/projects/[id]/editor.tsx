"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Section, Select, Textarea } from "@/components/ui";
import type { Project, Stage } from "@/lib/types";

type Cat = { id: string; name: string; group: string };

export function ProjectEditor({ project, stages: initial, expenseCats }: { project: Project; stages: Stage[]; expenseCats: Cat[] }) {
  const r = useRouter();
  const [p, setP] = useState(project);
  const [stages, setStages] = useState(initial.map((s) => ({ ...s })));
  const [budget, setBudget] = useState<[string, number][]>(Object.entries(project.budget ?? {}).map(([k, v]) => [k, Number(v)]));
  const [busy, setBusy] = useState("");

  async function saveProject() {
    setBusy("p");
    const res = await fetch(`/api/projects/${p.id}`, { method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: p.name, site_address: p.site_address, quoted_value: p.quoted_value, start_date: p.start_date, end_date: p.end_date, status: p.status, notes: p.notes, budget: Object.fromEntries(budget.filter(([k, v]) => k && v > 0)) }) });
    setBusy(""); if (!res.ok) return alert((await res.json()).error); r.refresh();
  }
  async function saveStages() {
    setBusy("s");
    const res = await fetch(`/api/projects/${p.id}/stages`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ stages }) });
    setBusy(""); if (!res.ok) return alert((await res.json()).error); r.refresh();
  }
  const pctOf = (amt: number) => (p.quoted_value ? Math.round((amt / p.quoted_value) * 100) : 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Milestone billing" action={<Button size="sm" variant="secondary" onClick={() => setStages((x) => [...x, { id: "", company_id: p.company_id, project_id: p.id, name: "", is_extra: false, amount: 0, due_date: null, status: "pending", sort: x.length } as Stage])}>+ Stage</Button>}>
        <div className="space-y-2">
          {stages.map((s, i) => {
            const up = (q: Partial<Stage>) => setStages((x) => x.map((y, j) => (j === i ? { ...y, ...q } : y)));
            return (
              <div key={i} className="grid grid-cols-12 gap-1.5 text-sm">
                <Input className="col-span-12 sm:col-span-4" placeholder="Stage name" value={s.name} onChange={(e) => up({ name: e.target.value })} />
                <Input className="col-span-4 sm:col-span-2" inputMode="numeric" placeholder="₹" value={s.amount || ""} onChange={(e) => up({ amount: Number(e.target.value) || 0 })} title={`${pctOf(s.amount)}% of quote`} />
                <Input className="col-span-4 sm:col-span-3" type="date" value={s.due_date ?? ""} onChange={(e) => up({ due_date: e.target.value || null })} />
                <Select className="col-span-3 sm:col-span-2" value={s.status} onChange={(e) => up({ status: e.target.value as Stage["status"] })}><option value="pending">Pending</option><option value="invoiced">Invoiced</option><option value="paid">Paid</option></Select>
                <button className="col-span-1 text-muted" onClick={() => setStages((x) => x.filter((_, j) => j !== i))}>✕</button>
                <label className="col-span-12 -mt-1 flex items-center gap-1 text-xs text-muted"><input type="checkbox" checked={s.is_extra} onChange={(e) => up({ is_extra: e.target.checked })} /> Extra / change-order work (adds to contract)</label>
              </div>
            );
          })}
          <div className="flex items-center justify-between pt-1 text-xs text-muted">
            <span>Total ₹{stages.filter((s) => !s.is_extra).reduce((a, s) => a + s.amount, 0).toLocaleString("en-IN")} of quote ₹{Number(p.quoted_value).toLocaleString("en-IN")}</span>
            <Button size="sm" disabled={busy === "s"} onClick={saveStages}>Save stages</Button>
          </div>
        </div>
      </Section>
      <Section title="Project details & budget">
        <div className="space-y-3">
          <Field label="Name"><Input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quoted value (₹)"><Input inputMode="numeric" value={p.quoted_value || ""} onChange={(e) => setP({ ...p, quoted_value: Number(e.target.value) || 0 })} /></Field>
            <Field label="Status"><Select value={p.status} onChange={(e) => setP({ ...p, status: e.target.value as Project["status"] })}>{["lead", "active", "on_hold", "completed", "cancelled"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</Select></Field>
            <Field label="Start"><Input type="date" value={p.start_date ?? ""} onChange={(e) => setP({ ...p, start_date: e.target.value || null })} /></Field>
            <Field label="End"><Input type="date" value={p.end_date ?? ""} onChange={(e) => setP({ ...p, end_date: e.target.value || null })} /></Field>
          </div>
          <Field label="Site address"><Input value={p.site_address ?? ""} onChange={(e) => setP({ ...p, site_address: e.target.value })} /></Field>
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted">Budget by category</div>
            {budget.map(([k, v], i) => (
              <div key={i} className="flex gap-1.5">
                <Select value={k} onChange={(e) => setBudget((x) => x.map((y, j) => (j === i ? [e.target.value, y[1]] : y)))}>
                  <option value="">Category…</option>{expenseCats.map((c) => <option key={c.id} value={c.id}>{c.group} › {c.name}</option>)}
                </Select>
                <Input className="w-32" inputMode="numeric" value={v || ""} onChange={(e) => setBudget((x) => x.map((y, j) => (j === i ? [y[0], Number(e.target.value) || 0] : y)))} />
                <button className="px-2 text-muted" onClick={() => setBudget((x) => x.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            <button className="text-xs text-brand" onClick={() => setBudget((x) => [...x, ["", 0]])}>+ Budget line</button>
          </div>
          <Field label="Notes"><Textarea rows={2} value={p.notes ?? ""} onChange={(e) => setP({ ...p, notes: e.target.value })} /></Field>
          <Button disabled={busy === "p"} onClick={saveProject}>Save project</Button>
        </div>
      </Section>
    </div>
  );
}
