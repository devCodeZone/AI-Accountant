# AI Accountant

A white-label accounting app (installable PWA, mobile-first) for Indian interior-design and home-improvement businesses. Any company can sign up and use it under its own name, logo and colours. Inviting Homes opens it from its existing admin panel with one click, using a signed token (SSO).

Staff can add entries by **speaking**, **typing**, **photographing a bill** or with a simple form. Gemini reads the input and fills in the entry, then the person checks and confirms it before anything is saved. There are 9 registers, a dashboard, GST invoices and quotations, reports, Excel/Tally export, bank-statement import, smart alerts and an "Ask your accounts" chat.

---

## 1. What's inside

| Area | Features |
|---|---|
| Login | Phone + OTP (Supabase), **SSO from your existing app** (no second OTP), demo company |
| Setup | 4-step company wizard: name, logo, brand colour, address/state, GSTIN (optional, GST switches off if blank), PAN, bank, UPI, number prefixes, financial year |
| Roles | Owner · Admin · Staff/Site Supervisor (adds entries, no P&L) · Accountant/CA (read-only + export) |
| Entry | 🎙 Voice (Hindi/English/Hinglish) · ⌨ text · 📷 bill / kachha slip / UPI screenshot / cheque · ✎ form · offline queue |
| Registers | Cash book (daily closing) · Bank & UPI (reconcile) · Client payments (ageing 0–30/31–60/60+, WhatsApp reminder) · Office expenses · Project accounts · Vendor accounts · Labour/contractors (advances vs work, TDS 194C flag) · GST register · Pending review |
| Projects | Quoted vs received vs spent, milestone stages, extra work, budget vs actual, overrun alerts, shareable client statement |
| Documents | GST invoices (CGST/SGST vs IGST, HSN/SAC, amount in words, UPI QR), quotations → invoice, payment receipts, WhatsApp share link, print/PDF |
| Reports | P&L, cash flow, project statements, party ledgers, GST (3B / GSTR-1 style), TDS, day book |
| Export | Excel (one sheet per register) · Tally-friendly CSV |
| Import | Bank statement PDF / Excel / CSV (auto-match, duplicates, AI categories) · your old Excel ledger (column mapping + preview) |
| AI chat | "How much did we spend on plywood in October?" Answers come from fixed queries on your own data, and a **"Numbers used"** panel shows the figures behind each answer |
| Alerts | Overdue clients (ready WhatsApp text), vendor dues, budget overrun, cash without bill photo, duplicates, TDS threshold |
| Safety | Every table has `company_id` + RLS · soft delete · audit log · **period lock enforced in the database** · AI never saves silently and never edits confirmed entries |

Tech: Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth, Storage, RLS) · Gemini API · Recharts · SheetJS · Vercel. The whole stack fits in free tiers.

---

## 2. Step-by-step: VS Code → GitHub → Vercel

### Step 1 — Install tools (once)
1. **Node.js 20 or 22 LTS**: https://nodejs.org. Check it with `node -v`.
2. **Git**: https://git-scm.com. Check it with `git --version`.
3. **VS Code**, plus accounts on **GitHub**, **Supabase** and **Vercel** (all free).

### Step 2 — Open the project in VS Code
1. Unzip `ai-accountant.zip`, e.g. into `Documents/ai-accountant`.
2. In VS Code choose **File → Open Folder… →** `ai-accountant`.
3. Open the terminal (**Terminal → New Terminal**) and run:
   ```bash
   npm install
   ```

### Step 3 — Create the Supabase database
1. Go to https://supabase.com → **New project**. Name: `ai-accountant`, Region: **Mumbai (ap-south-1)**, set a DB password → Create.
2. Open **SQL Editor → New query**. Paste in the contents of each file below, and click **Run** after each one, in this order:
   1. `supabase/migrations/0001_schema.sql` (all tables, numbering, period-lock trigger)
   2. `supabase/migrations/0002_rls.sql` (Row Level Security / tenant isolation)
   3. `supabase/migrations/0003_storage.sql` (private `receipts` bucket for bill photos)
3. Go to **Project Settings → API** and copy the **Project URL**, the **anon public** key and the **service_role** key.

### Step 4 — Get a Gemini API key (free)
Go to https://aistudio.google.com/apikey → **Create API key** → copy it.

### Step 5 — Run it on your laptop
1. Copy `.env.example` to `.env.local` and fill in the values from Steps 3–4.
   - For `APP_SESSION_SECRET`, run `openssl rand -hex 32` (or type 64 random characters).
   - Keep `ENABLE_DEMO=true` for now.
   - To log in without SMS while testing, set `DEV_OTP_PHONES=<your 10-digit number>:123456`.
2. Run:
   ```bash
   npm run dev
   ```
3. Open http://localhost:3000.
   - Click **Try the demo company** to see sample data, **or**
   - log in with your number and OTP `123456`, then finish the setup wizard (company name **Inviting Homes**).

### Step 6 — Push to GitHub
On GitHub, create a **new private repository** called `ai-accountant` (leave it empty, no README). Then in the VS Code terminal:
```bash
git init
git add .
git commit -m "AI Accountant v1"
git branch -M main
git remote add origin https://github.com/<your-username>/ai-accountant.git
git push -u origin main
```
(`.env.local` is in `.gitignore`, so your secrets never go to GitHub.)

### Step 7 — Deploy on Vercel
1. Go to https://vercel.com → **Add New… → Project** → import `ai-accountant` from GitHub.
2. Framework preset is **Next.js**; leave the other settings at their defaults.
3. Under **Environment Variables**, add every key from your `.env.local`. Set `NEXT_PUBLIC_APP_URL` to the Vercel URL for now, e.g. `https://ai-accountant-xyz.vercel.app`.
4. Click **Deploy**. When it finishes, open the URL and log in.
5. Every later `git push` redeploys automatically.

### Step 8 — Your own sub-domain (optional, recommended)
1. Vercel → Project → **Settings → Domains** → add `accounts.inviting-homes.com`.
2. At your domain registrar, add the **CNAME** record Vercel shows (`accounts` → `cname.vercel-dns.com`).
3. Update `NEXT_PUBLIC_APP_URL` to `https://accounts.inviting-homes.com` and redeploy.

### Step 9 — Real SMS OTP (when you want OTP login for staff)
Supabase → **Authentication → Sign In / Providers → Phone** → enable it and choose **MSG91** (Indian DLT-friendly) or **Twilio**, then paste that provider's keys. After that, remove `DEV_OTP_PHONES`.
Inviting Homes users won't need this at all, because they come in through the **Account button (SSO)**.

### Step 10 — Turn off the demo for production
Set `ENABLE_DEMO=false` in Vercel and redeploy.

---

## 3. Connect the "Account" button on inviting-homes.com (SSO)

1. In the accounts app, log in as **Owner** → **Settings → Integration (SSO)**.
   - **company_external_id**: e.g. `inviting-homes`
   - **"Back to" link**: `https://inviting-homes.com/admin`
   - **App name**: `Inviting Homes Admin` → Save
   - Copy the **SSO secret**.
2. In the **inviting-homes.com backend** (server side, never in browser code), add the secret as env var `ACCOUNTS_SSO_SECRET`.
3. Add a route like this (Node/Express shown; a Next.js version is in Settings, ready to copy):
   ```js
   const jwt = require("jsonwebtoken");
   const crypto = require("crypto");
   app.get("/admin/accounts", requireAdmin, (req, res) => {
     const token = jwt.sign(
       { phone: req.user.phone, name: req.user.name, company_external_id: "inviting-homes",
         role: "owner", nonce: crypto.randomUUID() },
       process.env.ACCOUNTS_SSO_SECRET,
       { algorithm: "HS256", expiresIn: "2m" }
     );
     res.redirect("https://accounts.inviting-homes.com/sso?token=" + encodeURIComponent(token));
   });
   ```
4. Add the button in the admin panel:
   ```html
   <a href="/admin/accounts" target="_blank" rel="noopener">Account</a>
   ```

**How it's secured:** HS256 signature with a per-company secret, a maximum 5-minute lifetime (2 minutes recommended), a single-use `nonce` (replays are rejected), and the phone number is matched to the user. New phone numbers are added with the role in the token; existing users keep their role. It opens in a new tab or a WebView, and a "← Back to Inviting Homes Admin" link appears at the top.

**Another company** can do the same: it signs up, sets its own `company_external_id` and secret, and adds the snippet. Each company only ever sees its own data.

---

## 4. Environment variables

| Key | Required | What it is |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon key (only used to send/verify OTP) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Server-only key for database access (keep secret) |
| `APP_SESSION_SECRET` | ✅ | 32+ random characters; signs login cookies |
| `GEMINI_API_KEY` | ✅ for AI | Google AI Studio key |
| `GEMINI_MODEL` | – | Default `gemini-flash-latest` (always Google's current Flash model) |
| `NEXT_PUBLIC_APP_URL` | recommended | Public URL; used in share links and SSO snippets |
| `ENABLE_DEMO` | – | `true` shows the demo-company button |
| `DEV_OTP_PHONES` | – | Testing only: `9876543210:123456` fixed OTPs for listed numbers |

---

## 5. How the accounting works (for you and your CA)

- **One ledger table.** Every register, report, alert and chat answer is computed from the same `transactions` table with the same functions (`src/lib/ledger.ts`), so totals always match.
- **Entry types:**
  - `money`: cash, bank or UPI actually moved.
  - `vendor_bill`: bought on credit. It creates a payable, plus input GST if there is any.
  - `labour_work`: value of work a contractor finished. Payments to that contractor count against it, so advances are visible.
- **Profit is cash-basis:** money received minus money paid. Owner drawings, capital, loans, asset purchases, refunds and cash⇄bank transfers are **never** counted as income or expense.
- **Client "due now"** = milestone stages past their due date (or invoiced) + invoices, minus receipts. Receipts are applied oldest first, which drives the ageing.
- **Status:** only **confirmed** entries count. AI drafts saved "for review" and approximate ("from memory") entries wait in **Pending Review**.
- **Period lock:** after your CA closes a month, set **Settings → Period lock**. The database then refuses any insert, edit or delete before that date.
- **TDS 194C flag:** a single contractor payment over ₹30,000 or more than ₹1,00,000 in the year. Confirm the rate and applicability with your CA.

---

## 6. Security model
- The browser never talks to the database. All reads and writes go through server routes that use the service-role key and always filter by the signed-in user's `company_id`.
- RLS is **on** for every table, so the public anon key can read nothing. Policies are keyed to a `company_id` JWT claim in case you add direct client access later.
- Bill photos live in a **private** bucket and open only through short-lived signed URLs.
- Login sessions are HTTP-only, signed cookies (14 days).
- Every create, update, delete, confirm, login and import is written to `audit_log`. Each entry page shows its history.

---

## 7. Project structure
```
supabase/migrations/      SQL: schema, RLS, storage bucket
src/middleware.ts         route protection
src/lib/
  ledger.ts               all accounting maths (balances, P&L, receivables, payables, GST, alerts, statements)
  reports.ts              report tables + Excel sheets + Tally CSV
  txn-service.ts          validate/save/edit/delete entries (party auto-create, transfers, audit)
  ai/gemini.ts            Gemini REST client
  ai/extract.ts           voice/text/photo → draft entries
  ai/bank.ts              bank statement PDF reading + matching + categorising
  ai/chat.ts              "Ask your accounts" tool-calling over fixed queries
  sso.ts, session.ts      SSO token verification, cookie sessions
  demo.ts                 demo company seeder
src/app/(app)/            dashboard, add, registers, projects, parties, invoices, reports, import, chat, alerts, settings
src/app/share/            public invoice + client project statement links
src/app/api/              JSON endpoints
public/sw.js              offline service worker
```

## 8. Common issues
- **"SMS login isn't configured"**: set up Phone auth (Step 9) or use `DEV_OTP_PHONES` while testing.
- **"AI is busy (free-tier limit)"**: wait a minute; the free Gemini tier has per-minute limits. For heavy use, enable billing in Google AI Studio.
- **Upload fails over 4 MB**: phone photos are compressed automatically; for large PDFs, split the statement by month.
- **Voice button doesn't show live text**: some browsers lack speech recognition; the app then records audio and Gemini transcribes it.
- **Build error about `xlsx`**: run `npm install` again; SheetJS installs from its official CDN.
