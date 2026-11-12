import { handle, bad } from "@/lib/api";
import { apiSession } from "@/lib/session";
import { assert, can } from "@/lib/permissions";
import { sb } from "@/lib/supabase";
import { audit } from "@/lib/db";
import { pickProject } from "@/lib/pick";

export const POST = handle(async (req: Request) => {
  const s = await apiSession();
  assert(can.editEntries(s.role));
  const body = await req.json();
  if (!body.name?.trim()) bad("Project name is required");
  const db = sb();
  let client_id = body.client_id || null;
  if (!client_id && body.client_name?.trim()) {
    const { data } = await db.from("parties").insert({ company_id: s.company_id, name: body.client_name.trim(), type: "client", phone: body.client_phone || null }).select("id").single();
    client_id = data?.id ?? null;
  }
  const { data, error } = await db.from("projects").insert({ ...pickProject(body), client_id, company_id: s.company_id }).select("*").single();
  if (error) throw error;
  await audit(s.company_id, s.uid, "project", data.id, "create", null, data);
  return { id: data.id };
});
