import { NextResponse } from "next/server";
import { apiSession } from "@/lib/session";
import { signedUrl } from "@/lib/supabase";

export async function GET(req: Request) {
  const s = await apiSession().catch(() => null);
  const path = new URL(req.url).searchParams.get("path") ?? "";
  if (!s || !path.startsWith(`${s.company_id}/`)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const url = await signedUrl(path, 600);
  return url ? NextResponse.redirect(url) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
