import "server-only";
import { decodeJwt, jwtVerify } from "jose";
import { sb } from "./supabase";
import { normalizePhone } from "./format";
import { audit } from "./db";
import type { Role } from "./types";

const ROLES: Role[] = ["owner", "admin", "staff", "accountant"];

export class SsoError extends Error {}

/**
 * Verify a token minted by the company's existing app:
 *   HS256, signed with that company's SSO secret, claims:
 *   { phone, name, company_external_id, role, exp, nonce }  — exp at most 5 minutes ahead, nonce single-use.
 */
export async function verifySsoToken(token: string) {
  let claims: Record<string, any>;
  try { claims = decodeJwt(token); } catch { throw new SsoError("Malformed token"); }
  const ext = String(claims.company_external_id ?? "");
  if (!ext) throw new SsoError("company_external_id missing");

  const db = sb();
  const { data: company } = await db.from("companies").select("id,name,sso_secret,sso_external_id").eq("sso_external_id", ext).maybeSingle();
  if (!company?.sso_secret) throw new SsoError("Unknown company");

  let payload: Record<string, any>;
  try {
    ({ payload } = await jwtVerify(token, new TextEncoder().encode(company.sso_secret), { algorithms: ["HS256"], clockTolerance: 30 }));
  } catch (e: any) {
    throw new SsoError(e?.code === "ERR_JWT_EXPIRED" ? "Link expired — click the Account button again" : "Invalid signature");
  }
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp - now > 300) throw new SsoError("Token lifetime must be 5 minutes or less");
  const nonce = String(payload.nonce ?? "");
  if (nonce.length < 8) throw new SsoError("nonce missing");
  const { error: nerr } = await db.from("sso_nonces").insert({ nonce: `${company.id}:${nonce}`, company_id: company.id });
  if (nerr) throw new SsoError("This link was already used — click the Account button again");

  const phone = normalizePhone(String(payload.phone ?? ""));
  if (!phone) throw new SsoError("phone missing or invalid");
  const role: Role = ROLES.includes(payload.role) ? payload.role : "staff";
  const name = payload.name ? String(payload.name).slice(0, 80) : null;

  // find or create the user under this company
  let { data: user } = await db.from("app_users").select("*").eq("company_id", company.id).eq("phone", phone).maybeSingle();
  if (!user) {
    const ins = await db.from("app_users").insert({ company_id: company.id, phone, name, role }).select("*").single();
    if (ins.error) throw ins.error;
    user = ins.data;
    await audit(company.id, user.id, "user", user.id, "create", null, { phone, role, via: "sso" });
  } else if (!user.active) {
    throw new SsoError("This user has been deactivated");
  }
  await db.from("app_users").update({ last_login_at: new Date().toISOString(), ...(name && !user.name ? { name } : {}) }).eq("id", user.id);
  await audit(company.id, user.id, "user", user.id, "login", null, { via: "sso" });
  return { company, user };
}
