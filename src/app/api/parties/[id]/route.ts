import { handle } from "@/lib/api";
import { apiSession } from "@/lib/session";
import { assert, can } from "@/lib/permissions";
import { sb } from "@/lib/supabase";
import { audit } from "@/lib/db";
import { pickParty } from "@/lib/pick";

type P = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, { params }: P) => {
  const s = await apiSession();
  assert(can.editEntries(s.role));
  const { id } = await params;
  const patch = pickParty(await req.json());
  const { error } = await sb().from("parties").update(patch).eq("id", id).eq("company_id", s.company_id);
  if (error) throw error;
  await audit(s.company_id, s.uid, "party", id, "update", null, patch);
  return { ok: true };
});

export const DELETE = handle(async (_req: Request, { params }: P) => {
  const s = await apiSession();
  assert(can.deleteEntries(s.role));
  const { id } = await params;
  await sb().from("parties").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("company_id", s.company_id);
  await audit(s.company_id, s.uid, "party", id, "delete");
  return { ok: true };
});
