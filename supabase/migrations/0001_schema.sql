-- =====================================================================
-- AI Accountant — core schema (multi-tenant / white-label)
-- Run in Supabase: SQL Editor → paste → Run. Safe to run once on a new project.
-- Every business table carries company_id. RLS policies are in 0002_rls.sql.
-- =====================================================================
create extension if not exists pgcrypto;

-- ---------- Companies (tenants) ----------
create table if not exists companies (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  legal_name       text,
  logo_url         text,
  brand_color      text not null default '#0f766e',
  address          text,
  city             text,
  state            text,
  state_code       text,              -- 2-digit GST state code, e.g. '06' Haryana
  pincode          text,
  phone            text,
  email            text,
  gstin            text,              -- blank => GST features switched off
  pan              text,
  bank_name        text,
  bank_account_no  text,
  bank_ifsc        text,
  upi_id           text,
  invoice_prefix   text not null default 'INV',
  receipt_prefix   text not null default 'RCT',
  quotation_prefix text not null default 'QT',
  fy_start_month   int  not null default 4 check (fy_start_month between 1 and 12),
  currency         text not null default 'INR',
  lock_before      date,              -- period lock: entries dated before this cannot change
  -- SSO from the company's existing app
  sso_external_id  text unique,       -- value the existing app puts in company_external_id
  sso_secret       text,              -- HS256 shared secret
  sso_return_url   text,              -- "Back to <company app>" link
  app_label        text,              -- e.g. "Inviting Homes Admin"
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now()
);

-- ---------- Users / memberships ----------
create table if not exists app_users (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  phone         text not null,        -- E.164, e.g. +919876543210
  name          text,
  role          text not null default 'staff'
                check (role in ('owner','admin','staff','accountant')),
  active        boolean not null default true,
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  unique (company_id, phone)
);
create index if not exists app_users_phone_idx on app_users(phone);

-- ---------- Money accounts (cash boxes, banks, UPI) ----------
create table if not exists accounts (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  name            text not null,
  type            text not null check (type in ('cash','bank','upi','card')),
  opening_balance numeric(14,2) not null default 0,
  bank_name       text,
  account_last4   text,
  is_default      boolean not null default false,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);
create index if not exists accounts_company_idx on accounts(company_id);

-- ---------- Categories (seeded per company, editable) ----------
create table if not exists categories (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  name         text not null,
  group_name   text not null,   -- Income | Project materials | Project labour | Site expenses | Overheads | Other
  kind         text not null check (kind in ('income','expense','other')),
  counts_in_pl boolean not null default true,   -- false for drawings, capital, loans, assets, refunds, transfers
  is_transfer  boolean not null default false,
  sort         int not null default 0,
  active       boolean not null default true,
  unique (company_id, name)
);
create index if not exists categories_company_idx on categories(company_id);

-- ---------- Parties: clients, vendors, labour ----------
create table if not exists parties (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  name            text not null,
  type            text not null check (type in ('client','vendor','labour','other')),
  trade           text,          -- carpenter, painter, electrician … (labour)
  phone           text,
  email           text,
  gstin           text,
  pan             text,
  address         text,
  state           text,
  opening_balance numeric(14,2) not null default 0, -- client: they owe us; vendor/labour: we owe them
  notes           text,
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index if not exists parties_company_idx on parties(company_id);

-- ---------- Projects ----------
create table if not exists projects (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  name          text not null,
  client_id     uuid references parties(id),
  site_address  text,
  quoted_value  numeric(14,2) not null default 0,
  budget        jsonb not null default '{}'::jsonb,  -- { "<category_id>": amount }
  start_date    date,
  end_date      date,
  status        text not null default 'active'
                check (status in ('lead','active','on_hold','completed','cancelled')),
  share_token   text unique default encode(gen_random_bytes(12),'hex'),
  notes         text,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists projects_company_idx on projects(company_id);

-- ---------- Milestone billing stages ----------
create table if not exists project_stages (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  project_id  uuid not null references projects(id) on delete cascade,
  name        text not null,
  is_extra    boolean not null default false,  -- extra / change-order work
  amount      numeric(14,2) not null default 0,
  due_date    date,
  status      text not null default 'pending' check (status in ('pending','invoiced','paid')),
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists stages_project_idx on project_stages(project_id);

-- ---------- Invoices, quotations, receipts ----------
create table if not exists invoices (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id) on delete cascade,
  doc_type         text not null check (doc_type in ('invoice','quotation','receipt')),
  number           text not null,
  doc_date         date not null default current_date,
  due_date         date,
  party_id         uuid references parties(id),
  project_id       uuid references projects(id),
  stage_id         uuid references project_stages(id),
  transaction_id   uuid,              -- for receipts
  place_of_supply  text,              -- 2-digit state code
  items            jsonb not null default '[]'::jsonb, -- [{description,hsn_sac,qty,unit,rate,gst_rate}]
  subtotal         numeric(14,2) not null default 0,
  cgst             numeric(14,2) not null default 0,
  sgst             numeric(14,2) not null default 0,
  igst             numeric(14,2) not null default 0,
  total            numeric(14,2) not null default 0,
  notes            text,
  terms            text,
  status           text not null default 'draft' check (status in ('draft','sent','paid','cancelled')),
  share_token      text unique default encode(gen_random_bytes(12),'hex'),
  created_by       uuid references app_users(id),
  created_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  unique (company_id, doc_type, number)
);
create index if not exists invoices_company_idx on invoices(company_id);

-- Atomic document numbering per company / type / financial year
create table if not exists doc_counters (
  company_id uuid not null references companies(id) on delete cascade,
  doc_type   text not null,
  fy         text not null,          -- e.g. '2026-27'
  last_no    int  not null default 0,
  primary key (company_id, doc_type, fy)
);

create or replace function next_doc_no(p_company uuid, p_type text, p_fy text)
returns int language plpgsql as $$
declare n int;
begin
  insert into doc_counters(company_id, doc_type, fy, last_no) values (p_company, p_type, p_fy, 1)
  on conflict (company_id, doc_type, fy) do update set last_no = doc_counters.last_no + 1
  returning last_no into n;
  return n;
end $$;

-- ---------- THE central ledger ----------
-- Every register is a filtered view of this table so totals always match.
--   entry_type = 'money'       → real cash/bank/UPI movement (affects balances, P&L on cash basis)
--   entry_type = 'vendor_bill' → purchase booked on credit (affects vendor payable + input GST)
--   entry_type = 'labour_work' → value of work done by a contractor (affects labour balance)
create table if not exists transactions (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  txn_date       date not null,
  amount         numeric(14,2) not null check (amount > 0),
  direction      text not null check (direction in ('in','out')),
  entry_type     text not null default 'money' check (entry_type in ('money','vendor_bill','labour_work')),
  mode           text check (mode in ('cash','bank','upi','cheque','card')),
  account_id     uuid references accounts(id),
  party_id       uuid references parties(id),
  project_id     uuid references projects(id),
  stage_id       uuid references project_stages(id),
  category_id    uuid references categories(id),
  sub_category   text,
  gst_rate       numeric(5,2),
  gst_amount     numeric(14,2) not null default 0,
  tds_amount     numeric(14,2) not null default 0,
  bill_no        text,
  reference      text,              -- UTR / cheque no / bank narration
  due_date       date,              -- for vendor bills
  settles_bill   boolean not null default false, -- money out that pays an earlier vendor bill (credit purchase)
  notes          text,
  attachments    text[] not null default '{}',  -- storage paths in bucket 'receipts'
  source         text not null default 'typed'
                 check (source in ('typed','voice','photo','bank_import','excel_import','manual')),
  status         text not null default 'confirmed' check (status in ('draft','needs_review','confirmed')),
  is_approximate boolean not null default false,
  ai_confidence  numeric(4,3),
  ai_raw         jsonb,
  reconciled     boolean not null default false,
  transfer_group uuid,              -- pairs the two legs of a cash<->bank transfer
  invoice_id     uuid references invoices(id),
  created_by     uuid references app_users(id),
  updated_by     uuid references app_users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  deleted_by     uuid references app_users(id)
);
create index if not exists txn_company_date_idx on transactions(company_id, txn_date);
create index if not exists txn_company_status_idx on transactions(company_id, status);
create index if not exists txn_party_idx on transactions(party_id);
create index if not exists txn_project_idx on transactions(project_id);

-- ---------- Audit log ----------
create table if not exists audit_log (
  id         bigserial primary key,
  company_id uuid not null references companies(id) on delete cascade,
  user_id    uuid references app_users(id),
  entity     text not null,
  entity_id  uuid,
  action     text not null,         -- create | update | delete | confirm | import | login
  before     jsonb,
  after      jsonb,
  at         timestamptz not null default now()
);
create index if not exists audit_company_idx on audit_log(company_id, at desc);

-- ---------- SSO single-use nonces ----------
create table if not exists sso_nonces (
  nonce      text primary key,
  company_id uuid not null references companies(id) on delete cascade,
  used_at    timestamptz not null default now()
);

-- ---------- Guards (enforced in the database, not just the UI) ----------
-- 1) Period lock: entries dated before companies.lock_before cannot be edited/deleted,
--    and new entries cannot be created inside a locked period.
-- 2) updated_at maintenance.
create or replace function txn_guard() returns trigger language plpgsql as $$
declare lock_d date;
begin
  select lock_before into lock_d from companies
   where id = coalesce(new.company_id, old.company_id);
  if lock_d is not null then
    if tg_op in ('UPDATE','DELETE') and old.txn_date < lock_d then
      raise exception 'PERIOD_LOCKED: entries before % are locked', lock_d;
    end if;
    if tg_op in ('INSERT','UPDATE') and new.txn_date < lock_d then
      raise exception 'PERIOD_LOCKED: entries before % are locked', lock_d;
    end if;
  end if;
  if tg_op = 'UPDATE' then new.updated_at := now(); end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists txn_guard_trg on transactions;
create trigger txn_guard_trg before insert or update or delete on transactions
for each row execute function txn_guard();
