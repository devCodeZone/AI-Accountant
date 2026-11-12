import { NextResponse } from "next/server";
import { ensureDemo } from "@/lib/demo";
import { setSession } from "@/lib/session";

export async function POST(req: Request) {
  if (process.env.ENABLE_DEMO !== "true") return NextResponse.json({ error: "Demo is switched off" }, { status: 403 });
  try {
    const u = await ensureDemo();
    await setSession({ uid: u.id, phone: u.phone, name: u.name, company_id: u.company_id, role: u.role, via: "demo" });
    return NextResponse.redirect(new URL("/dashboard", req.url), 303);
  } catch (e: any) {
    console.error(e);
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent("Demo setup failed: " + (e?.message ?? ""))}`, req.url), 303);
  }
}
