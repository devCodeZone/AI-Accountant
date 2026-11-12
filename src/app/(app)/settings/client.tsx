"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Field, Input, Select, cx } from "@/components/ui";
import { CompanyForm } from "@/components/company-form";
import { GROUPS } from "@/lib/categories";
import { ROLE_LABEL } from "@/lib/permissions";
import { dmy } from "@/lib/format";
import type { Company } from "@/lib/types";

async function call(action: string, data?: object) {
  const res = await fetch("/api/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, data, ...(data ?? {}) }) });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error);
  return j;
}

const TABS = ["Company", "Team", "Accounts", "Categories", "Period lock", "Integration (SSO)"] as const;

export function SettingsClient({ company, users, accounts, categories, me, isOwner, origin }: {
  company: Company; users: any[]; accounts: any[]; categories: any[]; me: string; isOwner: boolean; origin: string;
}) {
  const r = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Company");
  const run = async (fn: () => Promise<unknown>) => { try { await fn(); r.refresh(); } catch (e: any) { alert(e.message); } };

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto pb-1">
        {TABS.filter((t) => isOwner || (t !== "Integration (SSO)" && t !== "Period lock")).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cx("whitespace-nowrap rounded-full border px-3 py-1 text-sm", tab === t ? "border-brand bg-brand text-white" : "border-line bg-white")}>{t}</button>
        ))}
      </div>

      {tab === "Company" && (
        <Card className="max-w-2xl p-5">
          <CompanyForm initial={company as any} submitLabel="Save company" onSubmit={async (v) => { await call("company", v); r.refresh(); return "Saved ✓"; }} />
        </Card>
      )}

      {tab === "Team" && <Team users={users} me={me} isOwner={isOwner} run={run} />}
      {tab === "Accounts" && <Accounts accounts={accounts} run={run} />}
      {tab === "Categories" && <Categories categories={categories} run={run} />}

      {tab === "Period lock" && (
        <Card className="max-w-xl space-y-3 p-5">
          <p className="text-sm text-muted">After your CA closes a month, lock it so no one can add, change or delete entries dated before the lock date. The database enforces this.</p>
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); const v = new FormData(e.currentTarget).get("d") as string; run(() => call("lock", { lock_before: v })); }}>
            <Field label="Lock all entries before"><Input type="date" name="d" defaultValue={company.lock_before ?? ""} /></Field>
            <Button>Save</Button>
            {company.lock_before && <Button type="button" variant="ghost" onClick={() => run(() => call("lock", { lock_before: null }))}>Unlock all</Button>}
          </form>
          {company.lock_before && <Badge tone="warn">Locked before {dmy(company.lock_before)}</Badge>}
        </Card>
      )}

      {tab === "Integration (SSO)" && <Sso company={company} origin={origin} run={run} />}
    </div>
  );
}

function Team({ users, me, isOwner, run }: { users: any[]; me: string; isOwner: boolean; run: (f: () => Promise<unknown>) => void }) {
  const [v, setV] = useState({ phone: "", name: "", role: "staff" });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="divide-y divide-line">
        {users.map((u) => (
          <div key={u.id} className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
            <div className="min-w-0"><div className="truncate font-medium">{u.name ?? u.phone} {u.id === me && <Badge>you</Badge>} {!u.active && <Badge tone="bad">inactive</Badge>}</div><div className="text-xs text-muted">{u.phone}{u.last_login_at ? ` · last in ${dmy(u.last_login_at.slice(0, 10))}` : " · never logged in"}</div></div>
            {u.id !== me ? (
              <div className="flex items-center gap-1">
                <Select className="h-8 w-auto text-xs" value={u.role} onChange={(e) => run(() => call("user_update", { id: u.id, role: e.target.value }))}>
                  {(isOwner ? ["owner", "admin", "staff", "accountant"] : ["admin", "staff", "accountant"]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r as keyof typeof ROLE_LABEL]}</option>)}
                </Select>
                <button className="text-xs text-muted" onClick={() => run(() => call("user_update", { id: u.id, active: !u.active }))}>{u.active ? "Disable" : "Enable"}</button>
              </div>
            ) : <span className="text-xs text-muted">{ROLE_LABEL[u.role as keyof typeof ROLE_LABEL]}</span>}
          </div>
        ))}
      </Card>
      <Card className="space-y-3 p-4">
        <div className="text-sm font-semibold">Invite by phone</div>
        <p className="text-xs text-muted">They log in with an OTP to this number (or via your app's Account button).</p>
        <Field label="Mobile"><Input inputMode="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} /></Field>
        <Field label="Name"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label="Role"><Select value={v.role} onChange={(e) => setV({ ...v, role: e.target.value })}>{["admin", "staff", "accountant", ...(isOwner ? ["owner"] : [])].map((r) => <option key={r} value={r}>{ROLE_LABEL[r as keyof typeof ROLE_LABEL]}</option>)}</Select></Field>
        <Button onClick={() => run(async () => { await call("user_invite", v); setV({ phone: "", name: "", role: "staff" }); })}>Add user</Button>
        <ul className="space-y-1 text-xs text-muted">
          <li><b>Staff / Site Supervisor:</b> adds entries, sees own entries & review, no P&L.</li>
          <li><b>Accountant / CA:</b> sees everything, exports, can't change anything.</li>
        </ul>
      </Card>
    </div>
  );
}

function Accounts({ accounts, run }: { accounts: any[]; run: (f: () => Promise<unknown>) => void }) {
  const [v, setV] = useState({ name: "", type: "bank", opening_balance: "" });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="divide-y divide-line">
        {accounts.map((a) => (
          <div key={a.id} className="flex items-center gap-2 px-4 py-3 text-sm">
            <div className="flex-1"><div className="font-medium">{a.name} {a.is_default && <Badge tone="brand">default</Badge>} {!a.active && <Badge tone="bad">hidden</Badge>}</div><div className="text-xs uppercase text-muted">{a.type}</div></div>
            <Input className="h-8 w-28 text-sm" inputMode="numeric" defaultValue={a.opening_balance} title="Opening balance" onBlur={(e) => Number(e.target.value) !== Number(a.opening_balance) && run(() => call("account_update", { id: a.id, opening_balance: e.target.value }))} />
            {!a.is_default && <button className="text-xs text-brand" onClick={() => run(() => call("account_update", { id: a.id, is_default: true }))}>Make default</button>}
            <button className="text-xs text-muted" onClick={() => run(() => call("account_update", { id: a.id, active: !a.active }))}>{a.active ? "Hide" : "Show"}</button>
          </div>
        ))}
      </Card>
      <Card className="space-y-3 p-4">
        <div className="text-sm font-semibold">Add cash box / bank / UPI</div>
        <Field label="Name"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. Site cash – Ramesh, ICICI current" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type"><Select value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })}><option value="cash">Cash</option><option value="bank">Bank</option><option value="upi">UPI wallet</option><option value="card">Card</option></Select></Field>
          <Field label="Opening balance"><Input inputMode="numeric" value={v.opening_balance} onChange={(e) => setV({ ...v, opening_balance: e.target.value })} /></Field>
        </div>
        <Button onClick={() => run(async () => { await call("account_add", v); setV({ name: "", type: "bank", opening_balance: "" }); })}>Add</Button>
        <p className="text-xs text-muted">Opening balance is the amount on the day you start using the app.</p>
      </Card>
    </div>
  );
}

function Categories({ categories, run }: { categories: any[]; run: (f: () => Promise<unknown>) => void }) {
  const [v, setV] = useState({ name: "", group_name: "Project materials" });
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-2 p-4">
        <Field label="New category"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label="Group"><Select value={v.group_name} onChange={(e) => setV({ ...v, group_name: e.target.value })}>{GROUPS.map((g) => <option key={g}>{g}</option>)}</Select></Field>
        <Button onClick={() => run(async () => { await call("category_add", v); setV({ ...v, name: "" }); })}>Add</Button>
      </Card>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {GROUPS.map((g) => (
          <Card key={g} className="p-4">
            <div className="mb-2 text-sm font-semibold">{g}</div>
            <ul className="space-y-1 text-sm">
              {categories.filter((c) => c.group_name === g).map((c) => (
                <li key={c.id} className="flex items-center gap-2">
                  <Input className="h-8 flex-1 text-sm" defaultValue={c.name} onBlur={(e) => e.target.value !== c.name && run(() => call("category_update", { id: c.id, name: e.target.value }))} disabled={c.is_transfer} />
                  {!c.counts_in_pl && <Badge>not P&L</Badge>}
                  <button className="text-xs text-muted" onClick={() => run(() => call("category_update", { id: c.id, active: !c.active }))}>{c.active ? "Hide" : "Show"}</button>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Sso({ company, origin, run }: { company: Company; origin: string; run: (f: () => Promise<unknown>) => void }) {
  const [secret, setSecret] = useState(company.sso_secret ?? "");
  const [show, setShow] = useState(false);
  const [v, setV] = useState({ sso_external_id: company.sso_external_id ?? "", sso_return_url: company.sso_return_url ?? "", app_label: company.app_label ?? "" });
  const ext = v.sso_external_id || "<company_external_id>";
  const node = `// Existing app (Node / Express) — server side only. npm i jsonwebtoken
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

// Your admin is already logged in with phone OTP here.
app.get("/admin/accounts", requireAdmin, (req, res) => {
  const token = jwt.sign(
    {
      phone: req.user.phone,          // "+919876543210" or "9876543210"
      name: req.user.name,
      company_external_id: "${ext}",
      role: "owner",                  // owner | admin | staff | accountant
      nonce: crypto.randomUUID(),     // single use
    },
    process.env.ACCOUNTS_SSO_SECRET,  // the secret shown above
    { algorithm: "HS256", expiresIn: "2m" }
  );
  res.redirect("${origin}/sso?token=" + encodeURIComponent(token));
});

// The "Account" button in your admin panel:
// <a href="/admin/accounts" target="_blank" rel="noopener">Account</a>`;
  const next = `// Existing app (Next.js App Router): app/admin/accounts/route.ts
// npm i jose
import { SignJWT } from "jose";
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth"; // your existing phone-OTP session

export async function GET() {
  const admin = await getAdmin();
  if (!admin) return NextResponse.redirect(new URL("/admin/login", process.env.SITE_URL));
  const token = await new SignJWT({
    phone: admin.phone,
    name: admin.name,
    company_external_id: "${ext}",
    role: "owner",
    nonce: crypto.randomUUID(),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2m")
    .sign(new TextEncoder().encode(process.env.ACCOUNTS_SSO_SECRET!));
  return NextResponse.redirect("${origin}/sso?token=" + encodeURIComponent(token));
}

// Button in your admin page:
// <a href="/admin/accounts" target="_blank" rel="noopener">Account</a>`;

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-5">
        <p className="text-sm text-muted">Let your existing app (e.g. your website's admin panel) open this accounts app with one click — no second OTP. Your app signs a 2-minute token with the secret below and opens <code className="rounded bg-stone-100 px-1">{origin}/sso?token=…</code>.</p>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="company_external_id"><Input value={v.sso_external_id} onChange={(e) => setV({ ...v, sso_external_id: e.target.value })} /></Field>
          <Field label="“Back to” link (your app)"><Input value={v.sso_return_url} onChange={(e) => setV({ ...v, sso_return_url: e.target.value })} placeholder="https://your-site.com/admin" /></Field>
          <Field label="Your app's name"><Input value={v.app_label} onChange={(e) => setV({ ...v, app_label: e.target.value })} placeholder="Admin panel" /></Field>
        </div>
        <Button onClick={() => run(() => call("company", v))}>Save</Button>
      </Card>
      <Card className="space-y-2 p-5">
        <div className="text-sm font-semibold">SSO secret (HS256)</div>
        <div className="flex flex-wrap items-center gap-2">
          <code className="break-all rounded-lg bg-stone-100 px-2 py-1 text-xs">{show ? secret : "•".repeat(32)}</code>
          <Button size="sm" variant="secondary" onClick={() => setShow(!show)}>{show ? "Hide" : "Show"}</Button>
          <Button size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(secret)}>Copy</Button>
          <Button size="sm" variant="danger" onClick={() => confirm("Regenerate? Your existing app must be updated with the new secret.") && run(async () => { const j = await call("sso_regenerate"); setSecret(j.secret); setShow(true); })}>Regenerate</Button>
        </div>
        <p className="text-xs text-muted">Keep this only on your app's server (env var <code>ACCOUNTS_SSO_SECRET</code>). Never put it in browser code.</p>
      </Card>
      {[["Node.js / Express", node], ["Next.js", next]].map(([t, code]) => (
        <Card key={t} className="p-5">
          <div className="mb-2 flex items-center justify-between"><div className="text-sm font-semibold">{t}</div><Button size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(code)}>Copy</Button></div>
          <pre className="overflow-x-auto rounded-xl bg-stone-900 p-3 text-xs text-stone-100">{code}</pre>
        </Card>
      ))}
      <Card className="p-4 text-xs text-muted">Works in a new tab or an in-app WebView. Tokens expire in 2 minutes and each can be used once. New phone numbers are added to your team automatically with the role in the token; existing users keep their role.</Card>
    </div>
  );
}
