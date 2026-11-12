import { handle, bad } from "@/lib/api";
import { normalizePhone } from "@/lib/format";
import { verifyOtp } from "@/lib/otp";
import { sb } from "@/lib/supabase";
import { setSession } from "@/lib/session";
import { audit } from "@/lib/db";

export const POST = handle(async (req: Request) => {
  const { phone, code } = await req.json();
  const p = normalizePhone(phone);
  if (!p || !code) bad("Phone and OTP are required");
  if (!(await verifyOtp(p, String(code).trim()))) bad("Wrong or expired OTP");
  const { data: users } = await sb().from("app_users").select("*").eq("phone", p).eq("active", true)
    .order("last_login_at", { ascending: false, nullsFirst: false });
  const u = users?.[0];
  if (!u) {
    await setSession({ uid: null, phone: p, name: null, company_id: null, role: null, via: "otp" });
    return { next: "/onboarding" };
  }
  await sb().from("app_users").update({ last_login_at: new Date().toISOString() }).eq("id", u.id);
  await audit(u.company_id, u.id, "user", u.id, "login", null, { via: "otp" });
  await setSession({ uid: u.id, phone: p, name: u.name, company_id: u.company_id, role: u.role, via: "otp" });
  return { next: "/dashboard" };
});
