import { handle } from "@/lib/api";
import { apiSession, HttpError } from "@/lib/session";
import { assert, can } from "@/lib/permissions";
import { sb } from "@/lib/supabase";
import { audit } from "@/lib/db";
import { pickProject } from "@/lib/pick";

type P = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, { params }: P) => {
  const s = await apiSession();
  assert(can.editEntries(s.role));
  const { id } = await params;
  const db = sb();
  const { data: before } = await db.from("projects").select("*").eq("id", id).eq("company_id", s.company_id).single();
  if (!before) throw new HttpError(404, "Not found");
  const { data, error } = await db.from("projects").update(pickProject(await req.json())).eq("id", id).eq("company_id", s.company_id).select("*").single();
  if (error) throw error;
  await audit(s.company_id, s.uid, "project", id, "update", before, data);
  return { ok: true };
});

export const DELETE = handle(async (_req: Request, { params }: P) => {
  const s = await apiSession();
  assert(can.deleteEntries(s.role));
  const { id } = await params;
  await sb().from("projects").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("company_id", s.company_id);
  await audit(s.company_id, s.uid, "project", id, "delete");
  return { ok: true };
});
