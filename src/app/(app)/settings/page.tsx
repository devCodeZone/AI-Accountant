import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/session";
import { can } from "@/lib/permissions";
import { sb } from "@/lib/supabase";
import { getCompany } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { SettingsClient } from "./client";
import { headers } from "next/headers";

export default async function Settings() {
  const s = await requireCompany();
  if (!can.manageSettings(s.role)) redirect("/dashboard");
  const db = sb();
  const [company, users, accounts, categories] = await Promise.all([
    getCompany(s.company_id),
    db.from("app_users").select("id,phone,name,role,active,last_login_at").eq("company_id", s.company_id).order("created_at"),
    db.from("accounts").select("*").eq("company_id", s.company_id).order("created_at"),
    db.from("categories").select("*").eq("company_id", s.company_id).order("sort"),
  ]);
  const h = await headers();
  const origin = process.env.NEXT_PUBLIC_APP_URL || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const owner = can.manageSso(s.role);
  return (
    <div className="space-y-4">
      <PageHeader title="Settings" subtitle={company.name} />
      <SettingsClient
        company={{ ...company, sso_secret: owner ? company.sso_secret : null }}
        users={users.data ?? []} accounts={accounts.data ?? []} categories={categories.data ?? []}
        me={s.uid} isOwner={owner} origin={origin} />
    </div>
  );
}
