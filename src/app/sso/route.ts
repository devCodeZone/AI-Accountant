import { NextRequest, NextResponse } from "next/server";
import { verifySsoToken, SsoError } from "@/lib/sso";
import { setSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  try {
    const { company, user } = await verifySsoToken(token);
    await setSession({ uid: user.id, phone: user.phone, name: user.name, company_id: company.id, role: user.role, via: "sso" });
    const next = req.nextUrl.searchParams.get("next");
    const dest = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
    return NextResponse.redirect(new URL(dest, req.url));
  } catch (e) {
    const msg = e instanceof SsoError ? e.message : "Sign-in failed";
    if (!(e instanceof SsoError)) console.error(e);
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(msg)}`, req.url));
  }
}
