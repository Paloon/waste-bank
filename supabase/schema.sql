-- Schema v2: run in a maintenance window after backup. Only service_role can access data.
begin;
create table if not exists public.waste_bank_state(id integer primary key check(id=1),version bigint not null default 0,value jsonb not null);
alter table public.waste_bank_state add column if not exists schema_version integer not null default 1;
create table if not exists public.waste_bank_secrets(name text primary key,value jsonb not null);
create table if not exists public.waste_bank_records(
 kind text not null,id text not null,data jsonb not null,
 student text generated always as (data->>'student') stored,
 status text generated always as (data->>'status') stored,
 at text generated always as (data->>'at') stored,
 primary key(kind,id),
 check(kind<>'ledger' or (jsonb_typeof(data->'amount')='number' and (data->>'amount')::numeric=trunc((data->>'amount')::numeric) and abs((data->>'amount')::numeric)<=100000)),
 check(kind<>'rewards' or ((data->>'stock')::numeric>=0 and (data->>'price')::numeric>0))
) partition by list(kind);
do $$ declare k text;begin
 foreach k in array array['students','staff','rewards','submissions','redemptions','ledger','audit','requests','meta','mediaJobs'] loop
  execute format('create table if not exists public.%I partition of public.waste_bank_records for values in (%L)','waste_bank_'||lower(k),k);
  execute format('alter table public.%I enable row level security','waste_bank_'||lower(k));
  execute format('revoke all on public.%I from public,anon,authenticated','waste_bank_'||lower(k));
 end loop;
end $$;
create index if not exists wb_student_history on public.waste_bank_records(kind,student,at desc,id);
create index if not exists wb_status_history on public.waste_bank_records(kind,status,at desc,id);
create index if not exists wb_history on public.waste_bank_records(kind,at desc,id);
create table if not exists public.waste_bank_controls(id text primary key,value jsonb not null,expires bigint not null);
create index if not exists wb_controls_expiry on public.waste_bank_controls(expires);
do $$ declare t text;begin
 foreach t in array array['waste_bank_state','waste_bank_secrets','waste_bank_records','waste_bank_controls'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to service_role',t);
 end loop;
end $$;
-- Backfill once, then remove the old JSON copy. The entire migration is atomic.
do $$ declare s jsonb;k text;r jsonb;e record;begin
 select value into s from public.waste_bank_state where id=1 and schema_version=1 for update;
 if s is not null then
  foreach k in array array['students','staff','rewards','submissions','redemptions','ledger','audit','mediaJobs'] loop
   for r in select value from jsonb_array_elements(coalesce(s->k,'[]')) loop
    insert into public.waste_bank_records(kind,id,data) values(k,r->>'id',r) on conflict do nothing;
   end loop;
  end loop;
  for e in select * from jsonb_each(coalesce(s->'requests','{}')) loop
   insert into public.waste_bank_records(kind,id,data) values('requests',e.key,e.value) on conflict do nothing;
  end loop;
  foreach k in array array['promotedYears','pendingDriveDeletes'] loop
   insert into public.waste_bank_records(kind,id,data) values('meta',k,coalesce(s->k,'[]')) on conflict do nothing;
  end loop;
  update public.waste_bank_state set value='{}',schema_version=2 where id=1;
 end if;
end $$;
create or replace function public.wb_snapshot(scope jsonb default null)
returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare out jsonb:='{}';k text;f jsonb;rows jsonb;ver bigint;begin
 select version into ver from waste_bank_state where id=1 and schema_version=2;
 if ver is null then raise exception 'SCHEMA_NOT_INITIALIZED';end if;
 for k,f in select * from jsonb_each(coalesce(scope,'{"students":{},"staff":{},"rewards":{},"submissions":{},"redemptions":{},"ledger":{},"audit":{},"requests":{},"mediaJobs":{},"meta":{}}')) loop
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'data',data)),'[]') into rows from(
   select r.id,r.data from waste_bank_records r where r.kind=k
    and (not(f?'ids') or r.id in(select jsonb_array_elements_text(f->'ids')))
    and (not(f?'students') or r.student in(select jsonb_array_elements_text(f->'students')))
    and (not(f?'status') or r.status=f->>'status')
    and (not(f?'query') or strpos(lower(r.data::text),lower(f->>'query'))>0 or r.student in(select jsonb_array_elements_text(coalesce(f->'queryStudents','[]'))))
   order by r.at desc nulls last,r.id
   limit case when f?'limit' then greatest(0,(f->>'limit')::int) else null end offset coalesce((f->>'offset')::int,0)
  ) q;
  if k='meta' then out:=out||coalesce((select jsonb_object_agg(e->>'id',e->'data') from jsonb_array_elements(rows)e),'{}');
  elsif k='requests' then out:=out||jsonb_build_object(k,coalesce((select jsonb_object_agg(e->>'id',e->'data') from jsonb_array_elements(rows)e),'{}'));
  else out:=out||jsonb_build_object(k,coalesce((select jsonb_agg(e->'data') from jsonb_array_elements(rows)e),'[]'));end if;
 end loop;
 return jsonb_build_object('version',ver,'value',out);
end $$;
create or replace function public.wb_commit(expected_version bigint,changes jsonb)
returns boolean language plpgsql security invoker set search_path=public as $$
declare r jsonb;begin
 perform 1 from waste_bank_state where id=1 and version=expected_version and schema_version=2 for update;
 if not found then return false;end if;
 for r in select * from jsonb_array_elements(changes->'deletes') loop delete from waste_bank_records where kind=r->>'kind' and id=r->>'id';end loop;
 for r in select * from jsonb_array_elements(changes->'upserts') loop
  insert into waste_bank_records(kind,id,data) values(r->>'kind',r->>'id',r->'data') on conflict(kind,id) do update set data=excluded.data;
 end loop;
 update waste_bank_state set version=version+1 where id=1;return true;
end $$;
create or replace function public.wb_initialize(initial_rows jsonb)
returns boolean language plpgsql security invoker set search_path=public as $$
declare r jsonb;begin
 insert into waste_bank_state(id,version,value,schema_version) values(1,1,'{}',2) on conflict do nothing;
 if not found then return false;end if;
 for r in select * from jsonb_array_elements(initial_rows) loop
  insert into waste_bank_records(kind,id,data) values(r->>'kind',r->>'id',r->'data');
 end loop;
 return true;
end $$;
create or replace function public.wb_control(op text,args jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v jsonb;n bigint:=floor(extract(epoch from clock_timestamp())*1000);k text:=args->>'id';begin
 if op='prune' then delete from waste_bank_controls where expires<=n;return 'true';end if;
 perform pg_advisory_xact_lock(hashtextextended(k,0));
 select value into v from waste_bank_controls where id=k;
 if op='get' then return case when (v->>'expires')::bigint>n then v else 'null'::jsonb end;end if;
 if op in('delete','consume') then delete from waste_bank_controls where id=k;return case when op='consume' and (v->>'expires')::bigint>n then v else 'null'::jsonb end;end if;
 if op='put' then v:=args->'value';
 elsif op='rate' then
  if v is null or (v->>'expires')::bigint<=n then v:=jsonb_build_object('count',0,'expires',n+(args->>'window')::bigint);end if;
  v:=v||jsonb_build_object('count',(v->>'count')::int+1);
 elsif op='touch' then
  if v is null or (v->>'expires')::bigint<=n or (v->>'absolute')::bigint<=n then delete from waste_bank_controls where id=k;return 'null';end if;
  v:=v||jsonb_build_object('expires',least((v->>'absolute')::bigint,n+(args->>'idle')::bigint));
 else raise exception 'INVALID_CONTROL';end if;
 insert into waste_bank_controls(id,value,expires) values(k,v,(v->>'expires')::bigint) on conflict(id) do update set value=excluded.value,expires=excluded.expires;
 if op='rate' then return jsonb_build_object('allowed',(v->>'count')::int<=(args->>'limit')::int,'retryAfter',greatest(1,ceil(((v->>'expires')::bigint-n)/1000.0)));end if;
 return v;
end $$;
create or replace function public.wb_summary()
returns jsonb language sql stable security invoker set search_path=public as $$
with scores as(
 select student,sum((data->>'amount')::bigint) balance,
 coalesce(sum((data->>'amount')::bigint) filter(where data->>'type' in('recycle','adjustment','opening')),0) earned,
 coalesce(sum((data->>'amount')::bigint) filter(where data->>'type' in('recycle','adjustment','opening') and to_char((data->>'at')::timestamptz at time zone 'Asia/Bangkok','YYYY-MM')=to_char(now() at time zone 'Asia/Bangkok','YYYY-MM')),0) monthly
 from waste_bank_records where kind='ledger' group by student
), students as(
 select r.data||jsonb_build_object('balance',coalesce(s.balance,0),'earned',coalesce(s.earned,0),'monthly',coalesce(s.monthly,0)) data from waste_bank_records r left join scores s on s.student=r.id where r.kind='students'
)
select jsonb_build_object(
 'databaseBytes',pg_database_size(current_database()),
 'students',coalesce((select jsonb_agg(data order by data->>'id') from students),'[]'),
 'rewards',coalesce((select jsonb_agg(data order by id) from waste_bank_records where kind='rewards'),'[]'),
 'counts',coalesce((select jsonb_object_agg(kind,n) from(select kind,count(*) n from waste_bank_records group by kind)c),'{}'),
 'stats',jsonb_build_object(
 'pending',(select count(*) from waste_bank_records where kind='submissions' and status='Pending'),
 'pickups',(select count(*) from waste_bank_records where kind='redemptions' and status='Pending Pickup'),
 'weight',(select coalesce(sum((data->>'weight')::numeric),0) from waste_bank_records where kind='submissions' and status='Approved'),
 'coins',(select coalesce(sum((data->>'amount')::bigint),0) from waste_bank_records where kind='ledger' and data->>'type'='recycle'),
 'submissions',(select count(*) from waste_bank_records where kind='submissions' and status='Approved'),
 'students',(select count(*) from waste_bank_records where kind='students' and status='Active'),
 'approvedToday',(select count(*) from waste_bank_records where kind='submissions' and status='Approved' and (coalesce(data->>'reviewedAt',data->>'at')::timestamptz at time zone 'Asia/Bangkok')::date=(now() at time zone 'Asia/Bangkok')::date),
 'coinsToday',(select coalesce(sum((data->>'amount')::bigint),0) from waste_bank_records where kind='ledger' and data->>'type'='recycle' and ((data->>'at')::timestamptz at time zone 'Asia/Bangkok')::date=(now() at time zone 'Asia/Bangkok')::date),
 'categories',coalesce((select jsonb_object_agg(category,n) from(select data->>'category' category,count(*) n from waste_bank_records where kind='submissions' and status='Approved' group by data->>'category')c),'{}')
 ));
$$;
drop function if exists public.waste_bank_commit(bigint,jsonb);
create or replace function public.wb_refresh_drive(expected_refresh text,next_value jsonb)
returns boolean language sql security invoker set search_path=public as $$
 with changed as(update waste_bank_secrets set value=next_value where name='drive_oauth' and value->>'refresh_token'=expected_refresh returning name) select exists(select 1 from changed);
$$;
revoke all on function public.wb_refresh_drive(text,jsonb) from public,anon,authenticated;
grant execute on function public.wb_refresh_drive(text,jsonb) to service_role;
revoke all on function public.wb_snapshot(jsonb),public.wb_commit(bigint,jsonb),public.wb_control(text,jsonb),public.wb_summary(),public.wb_initialize(jsonb) from public,anon,authenticated;
grant execute on function public.wb_snapshot(jsonb),public.wb_commit(bigint,jsonb),public.wb_control(text,jsonb),public.wb_summary(),public.wb_initialize(jsonb) to service_role;
commit;
