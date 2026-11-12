import { handle, bad } from "@/lib/api";
import { apiSession } from "@/lib/session";
import { assert, can } from "@/lib/permissions";
import { sb } from "@/lib/supabase";
import { audit } from "@/lib/db";
import { pickParty } from "@/lib/pick";

export const POST = handle(async (req: Request) => {
  const s = await apiSession();
  assert(can.addEntries(s.role));
  const body = await req.json();
  if (!body.name?.trim()) bad("Name is required");
  const { data, error } = await sb().from("parties").insert({ ...pickParty(body), type: body.type || "client", company_id: s.company_id }).select("id").single();
  if (error) throw error;
  await audit(s.company_id, s.uid, "party", data.id, "create", null, body);
  return { id: data.id };
});
