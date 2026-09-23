-- Run once in the Supabase SQL Editor. Only the server's secret key may read
-- or write these tables. Never expose SUPABASE_SECRET_KEY to the browser.
create table if not exists public.waste_bank_state (
  id integer primary key check (id = 1),
  version bigint not null default 0,
  value jsonb not null
);
create table if not exists public.waste_bank_secrets (
  name text primary key,
  value jsonb not null
);
alter table public.waste_bank_state enable row level security;
alter table public.waste_bank_secrets enable row level security;
revoke all on public.waste_bank_state from anon, authenticated;
revoke all on public.waste_bank_secrets from anon, authenticated;
grant select, insert, update on public.waste_bank_state to service_role;
grant select, insert, update on public.waste_bank_secrets to service_role;

create or replace function public.waste_bank_commit(expected_version bigint, next_value jsonb)
returns boolean
language sql
security invoker
set search_path = public
as $$
  with updated as (
    update public.waste_bank_state
       set value = next_value, version = version + 1
     where id = 1 and version = expected_version
    returning id
  )
  select exists(select 1 from updated);
$$;
revoke all on function public.waste_bank_commit(bigint,jsonb) from public, anon, authenticated;
grant execute on function public.waste_bank_commit(bigint,jsonb) to service_role;
