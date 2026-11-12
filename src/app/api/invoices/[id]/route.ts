import { handle, bad } from "@/lib/api";
import { apiSession } from "@/lib/session";
import { assert, can } from "@/lib/permissions";
import { sb } from "@/lib/supabase";
import { audit } from "@/lib/db";

type P = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, { params }: P) => {
  const s = await apiSession();
  assert(can.documents(s.role));
  const { id } = await params;
  const { status } = await req.json();
  if (!["draft", "sent", "paid", "cancelled"].includes(status)) bad("Bad status");
  const db = sb();
  const { data, error } = await db.from("invoices").update({ status }).eq("id", id).eq("company_id", s.company_id).select("stage_id").single();
  if (error) throw error;
  if (data?.stage_id && (status === "paid" || status === "cancelled"))
    await db.from("project_stages").update({ status: status === "paid" ? "paid" : "pending" }).eq("id", data.stage_id).eq("company_id", s.company_id);
  await audit(s.company_id, s.uid, "invoice", id, "status", null, { status });
  return { ok: true };
});
