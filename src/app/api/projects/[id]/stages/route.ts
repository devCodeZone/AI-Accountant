import { handle, bad } from "@/lib/api";
import { apiSession, HttpError } from "@/lib/session";
import { assert, can } from "@/lib/permissions";
import { sb } from "@/lib/supabase";
import { audit } from "@/lib/db";

type P = { params: Promise<{ id: string }> };

/** Replace the full list of milestone stages for a project. */
export const PUT = handle(async (req: Request, { params }: P) => {
  const s = await apiSession();
  assert(can.editEntries(s.role));
  const { id } = await params;
  const { stages } = await req.json();
  if (!Array.isArray(stages)) bad("stages must be a list");
  const db = sb();
  const { data: proj } = await db.from("projects").select("id").eq("id", id).eq("company_id", s.company_id).single();
  if (!proj) throw new HttpError(404, "Not found");
  const { data: existing } = await db.from("project_stages").select("id").eq("project_id", id);
  const keep = new Set(stages.filter((x: any) => x.id).map((x: any) => x.id));
  const remove = (existing ?? []).map((e) => e.id).filter((x) => !keep.has(x));
  if (remove.length) {
    await db.from("transactions").update({ stage_id: null }).in("stage_id", remove);
    await db.from("invoices").update({ stage_id: null }).in("stage_id", remove);
    await db.from("project_stages").delete().in("id", remove);
  }
  const rows = stages.map((x: any, i: number) => ({
    ...(x.id ? { id: x.id } : {}), company_id: s.company_id, project_id: id, name: String(x.name || `Stage ${i + 1}`),
    amount: Number(x.amount) || 0, due_date: x.due_date || null, status: ["pending", "invoiced", "paid"].includes(x.status) ? x.status : "pending",
    is_extra: !!x.is_extra, sort: i,
  }));
  if (rows.length) {
    const { error } = await db.from("project_stages").upsert(rows);
    if (error) throw error;
  }
  await audit(s.company_id, s.uid, "project", id, "stages", null, rows);
  return { ok: true };
});
