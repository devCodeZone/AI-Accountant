import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC = ["/login", "/sso", "/share", "/api/auth", "/manifest.webmanifest", "/sw.js", "/icons", "/offline"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p))) return NextResponse.next();
  const token = req.cookies.get("acct_session")?.value;
  let ok = false;
  if (token && process.env.APP_SESSION_SECRET) {
    try { await jwtVerify(token, new TextEncoder().encode(process.env.APP_SESSION_SECRET)); ok = true; } catch {}
  }
  if (ok) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
