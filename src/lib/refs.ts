import "server-only";
import { sb } from "./supabase";
import { getCompany } from "./db";

export type Refs = {
  gstOn: boolean;
  accounts: { id: string; name: string; type: string; is_default: boolean }[];
  categories: { id: string; name: string; group_name: string; kind: string; is_transfer: boolean }[];
  parties: { id: string; name: string; type: string; trade: string | null }[];
  projects: { id: string; name: string; status: string }[];
};

export async function getRefs(companyId: string): Promise<Refs> {
  const db = sb();
  const [c, a, cat, p, pr] = await Promise.all([
    getCompany(companyId),
    db.from("accounts").select("id,name,type,is_default").eq("company_id", companyId).eq("active", true).order("created_at"),
    db.from("categories").select("id,name,group_name,kind,is_transfer").eq("company_id", companyId).eq("active", true).order("sort"),
    db.from("parties").select("id,name,type,trade").eq("company_id", companyId).is("deleted_at", null).order("name"),
    db.from("projects").select("id,name,status").eq("company_id", companyId).is("deleted_at", null).order("created_at", { ascending: false }),
  ]);
  return { gstOn: !!c.gstin, accounts: a.data ?? [], categories: cat.data ?? [], parties: p.data ?? [], projects: pr.data ?? [] };
}
