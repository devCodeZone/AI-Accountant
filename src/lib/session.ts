import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role, Session } from "./types";

export const COOKIE = "acct_session";
const MAX_AGE = 60 * 60 * 24 * 14; // 14 days

function key() {
  const s = process.env.APP_SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("APP_SESSION_SECRET must be set (32+ random characters)");
  return new TextEncoder().encode(s);
}

export async function signSession(s: Session): Promise<string> {
  return new SignJWT({ ...s })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(key());
}

export async function readToken(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

export async function setSession(s: Session) {
  const jar = await cookies();
  jar.set(COOKIE, await signSession(s), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

export async function getSession(): Promise<Session | null> {
  return readToken((await cookies()).get(COOKIE)?.value);
}

/** For pages: must be signed in AND belong to a company. */
export async function requireCompany(): Promise<Session & { uid: string; company_id: string; role: Role }> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!s.company_id || !s.uid || !s.role) redirect("/onboarding");
  return s as Session & { uid: string; company_id: string; role: Role };
}

export { HttpError } from "./errors";
import { HttpError } from "./errors";

/** For API routes. */
export async function apiSession(): Promise<Session & { uid: string; company_id: string; role: Role }> {
  const s = await getSession();
  if (!s || !s.company_id || !s.uid || !s.role) throw new HttpError(401, "Not signed in");
  return s as Session & { uid: string; company_id: string; role: Role };
}
