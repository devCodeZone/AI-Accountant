-- =====================================================================
-- Row Level Security — tenant isolation
--
-- How access works:
--  * The browser NEVER talks to the database directly. All reads/writes go
--    through the app's server (Next.js route handlers) which uses the
--    service-role key and always filters by the signed-in user's company_id.
--  * RLS is still switched ON for every table, so the public anon key
--    can read/write NOTHING. If you later add direct client access, issue a
--    JWT with a "company_id" claim and these policies keep each tenant
--    locked to its own rows.
-- =====================================================================

create or replace function current_company_id() returns uuid
language sql stable as $$
  select nullif(coalesce(auth.jwt() ->> 'company_id', ''), '')::uuid
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'app_users','accounts','categories','parties','projects','project_stages',
    'invoices','doc_counters','transactions','audit_log','sso_nonces'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format(
      'create policy tenant_isolation on %I for all to authenticated
         using (company_id = current_company_id())
         with check (company_id = current_company_id())', t);
  end loop;
end $$;

alter table companies enable row level security;
drop policy if exists tenant_isolation on companies;
create policy tenant_isolation on companies for all to authenticated
  using (id = current_company_id()) with check (id = current_company_id());

-- Nothing for the anon role: no policies => no access.
revoke all on all tables in schema public from anon;
