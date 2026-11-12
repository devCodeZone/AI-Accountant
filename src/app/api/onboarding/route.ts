import { handle, bad } from "@/lib/api";
import { getSession, setSession, HttpError } from "@/lib/session";
import { createCompany } from "@/lib/company";

export const POST = handle(async (req: Request) => {
  const s = await getSession();
  if (!s) throw new HttpError(401, "Please log in first");
  const body = await req.json();
  if (!body.name?.trim()) bad("Company name is required");
  const { company, user } = await createCompany(body, { phone: s.phone, name: body.owner_name || s.name });
  await setSession({ uid: user.id, phone: user.phone, name: user.name, company_id: company.id, role: "owner", via: s.via });
  return { ok: true, next: "/dashboard" };
});
