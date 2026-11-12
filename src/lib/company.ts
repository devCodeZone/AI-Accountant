import "server-only";
import { randomBytes } from "crypto";
import { sb } from "./supabase";
import { seedRows } from "./categories";
import { audit } from "./db";

export type CompanyInput = {
  name: string; legal_name?: string; logo_url?: string; brand_color?: string; address?: string; city?: string;
  state?: string; state_code?: string; pincode?: string; phone?: string; email?: string; gstin?: string; pan?: string;
  bank_name?: string; bank_account_no?: string; bank_ifsc?: string; upi_id?: string;
  invoice_prefix?: string; receipt_prefix?: string; quotation_prefix?: string; fy_start_month?: number;
};

export const COMPANY_FIELDS = ["name", "legal_name", "logo_url", "brand_color", "address", "city", "state", "state_code", "pincode", "phone", "email", "gstin", "pan", "bank_name", "bank_account_no", "bank_ifsc", "upi_id", "invoice_prefix", "receipt_prefix", "quotation_prefix", "fy_start_month", "sso_external_id", "sso_return_url", "app_label", "lock_before"] as const;

export function pickCompanyFields(body: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const k of COMPANY_FIELDS) if (k in body) out[k] = typeof body[k] === "string" ? body[k].trim() || null : body[k];
  if (out.gstin) {
    out.gstin = String(out.gstin).toUpperCase();
    if (!out.state_code) out.state_code = out.gstin.slice(0, 2);
  }
  if (out.pan) out.pan = String(out.pan).toUpperCase();
  if ("fy_start_month" in out) out.fy_start_month = Number(out.fy_start_month) || 4;
  for (const k of ["invoice_prefix", "receipt_prefix", "quotation_prefix"]) if (k in out && !out[k]) delete out[k];
  if ("name" in out && !out.name) delete out.name;
  return out;
}

export const newSsoSecret = () => randomBytes(32).toString("hex");

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 30) || "company";
}

export async function createCompany(input: CompanyInput, owner: { phone: string; name?: string | null }, opts: { is_demo?: boolean } = {}) {
  const db = sb();
  const fields = pickCompanyFields(input as any);
  if (!fields.name) throw new Error("Company name is required");
  const { data: company, error } = await db.from("companies").insert({
    ...fields,
    sso_secret: newSsoSecret(),
    sso_external_id: `${slug(fields.name)}-${randomBytes(2).toString("hex")}`,
    is_demo: !!opts.is_demo,
  }).select("*").single();
  if (error) throw error;

  await db.from("categories").insert(seedRows(company.id));
  await db.from("accounts").insert([
    { company_id: company.id, name: "Cash in hand", type: "cash", is_default: true },
    { company_id: company.id, name: company.bank_name ? `${company.bank_name} (Current)` : "Main bank account", type: "bank", is_default: true, bank_name: company.bank_name },
  ]);
  const { data: user, error: uerr } = await db.from("app_users").insert({
    company_id: company.id, phone: owner.phone, name: owner.name ?? null, role: "owner", last_login_at: new Date().toISOString(),
  }).select("*").single();
  if (uerr) throw uerr;
  await audit(company.id, user.id, "company", company.id, "create", null, { name: company.name });
  return { company, user };
}
