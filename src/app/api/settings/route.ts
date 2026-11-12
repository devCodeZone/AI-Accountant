import { handle, bad } from "@/lib/api";
import { apiSession, HttpError } from "@/lib/session";
import { assert, can } from "@/lib/permissions";
import { sb } from "@/lib/supabase";
import { audit } from "@/lib/db";
import { newSsoSecret, pickCompanyFields } from "@/lib/company";
import { normalizePhone } from "@/lib/format";

/** One endpoint for all settings actions: { action: "...", ...data } */
export const POST = handle(async (req: Request) => {
  const s = await apiSession();
  assert(can.manageSettings(s.role));
  const body = await req.json();
  const db = sb();
  const cid = s.company_id;

  switch (body.action) {
    case "company": {
      const patch = pickCompanyFields(body.data ?? {});
      if (!can.manageSso(s.role)) { delete patch.sso_external_id; delete patch.lock_before; }
      if (patch.sso_external_id) {
        const { data: clash } = await db.from("companies").select("id").eq("sso_external_id", patch.sso_external_id).neq("id", cid).maybeSingle();
        if (clash) bad("That company ID is already used by another company");
      }
      const { error } = await db.from("companies").update(patch).eq("id", cid);
      if (error) throw error;
      await audit(cid, s.uid, "company", cid, "update", null, patch);
      return { ok: true };
    }
    case "lock": {
      assert(can.manageSso(s.role), "Only the owner can lock periods");
      const { error } = await db.from("companies").update({ lock_before: body.lock_before || null }).eq("id", cid);
      if (error) throw error;
      await audit(cid, s.uid, "company", cid, "period_lock", null, { lock_before: body.lock_before || null });
      return { ok: true };
    }
    case "sso_regenerate": {
      assert(can.manageSso(s.role), "Only the owner can manage SSO");
      const secret = newSsoSecret();
      await db.from("companies").update({ sso_secret: secret }).eq("id", cid);
      await audit(cid, s.uid, "company", cid, "sso_regenerate");
      return { secret };
    }
    case "account_add": {
      const d = body.data ?? {};
      if (!d.name) bad("Name required");
      const { error } = await db.from("accounts").insert({ company_id: cid, name: d.name, type: ["cash", "bank", "upi", "card"].includes(d.type) ? d.type : "bank", opening_balance: Number(d.opening_balance) || 0, bank_name: d.bank_name || null, account_last4: d.account_last4 || null });
      if (error) throw error;
      return { ok: true };
    }
    case "account_update": {
      const d = body.data ?? {};
      const patch: Record<string, unknown> = {};
      for (const k of ["name", "opening_balance", "active", "is_default"]) if (k in d) patch[k] = k === "opening_balance" ? Number(d[k]) || 0 : d[k];
      if (patch.is_default) {
        const { data: acc } = await db.from("accounts").select("type").eq("id", d.id).eq("company_id", cid).single();
        const cashLike = acc?.type === "cash";
        const { data: same } = await db.from("accounts").select("id,type").eq("company_id", cid);
        const ids = (same ?? []).filter((a) => (a.type === "cash") === cashLike).map((a) => a.id);
        if (ids.length) await db.from("accounts").update({ is_default: false }).in("id", ids);
      }
      await db.from("accounts").update(patch).eq("id", d.id).eq("company_id", cid);
      await audit(cid, s.uid, "account", d.id, "update", null, patch);
      return { ok: true };
    }
    case "category_add": {
      const d = body.data ?? {};
      if (!d.name || !d.group_name) bad("Name and group required");
      const kind = d.group_name === "Income" ? "income" : d.group_name === "Other" ? "other" : "expense";
      const { error } = await db.from("categories").insert({ company_id: cid, name: d.name, group_name: d.group_name, kind, counts_in_pl: kind !== "other", sort: 500 });
      if (error) throw new HttpError(400, error.message.includes("duplicate") ? "That category already exists" : error.message);
      return { ok: true };
    }
    case "category_update": {
      const d = body.data ?? {};
      const patch: Record<string, unknown> = {};
      for (const k of ["name", "active"]) if (k in d) patch[k] = d[k];
      await db.from("categories").update(patch).eq("id", d.id).eq("company_id", cid);
      return { ok: true };
    }
    case "user_invite": {
      assert(can.manageUsers(s.role));
      const d = body.data ?? {};
      const phone = normalizePhone(d.phone);
      if (!phone) bad("Enter a valid mobile number");
      const role = ["admin", "staff", "accountant", "owner"].includes(d.role) ? d.role : "staff";
      if (role === "owner") assert(s.role === "owner", "Only an owner can add another owner");
      const { error } = await db.from("app_users").upsert({ company_id: cid, phone, name: d.name || null, role, active: true }, { onConflict: "company_id,phone" });
      if (error) throw error;
      await audit(cid, s.uid, "user", null, "invite", null, { phone, role });
      return { ok: true };
    }
    case "user_update": {
      assert(can.manageUsers(s.role));
      const d = body.data ?? {};
      if (d.id === s.uid) bad("You can't change your own role here");
      const { data: target } = await db.from("app_users").select("role").eq("id", d.id).eq("company_id", cid).single();
      if (target?.role === "owner" && s.role !== "owner") bad("Only an owner can change another owner");
      const patch: Record<string, unknown> = {};
      if (d.role && ["owner", "admin", "staff", "accountant"].includes(d.role)) patch.role = d.role;
      if ("active" in d) patch.active = !!d.active;
      if (patch.role === "owner" && s.role !== "owner") bad("Only an owner can make someone owner");
      await db.from("app_users").update(patch).eq("id", d.id).eq("company_id", cid);
      await audit(cid, s.uid, "user", d.id, "update", null, patch);
      return { ok: true };
    }
    default:
      bad("Unknown action");
  }
});
