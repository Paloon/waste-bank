-- Additive, read-only performance endpoints. Apply after schema v2 is initialized.
begin;
create or replace function public.wb_metrics()
returns jsonb language sql stable security invoker set search_path=public as $$
select jsonb_build_object(
 'databaseBytes',pg_database_size(current_database()),
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
create or replace function public.wb_student_scores(target_ids text[] default null)
returns setof jsonb language sql stable security invoker set search_path=public as $$
with scores as (
 select student,sum((data->>'amount')::bigint) balance,
 coalesce(sum((data->>'amount')::bigint) filter(where data->>'type' in('recycle','adjustment','opening')),0) earned,
 coalesce(sum((data->>'amount')::bigint) filter(where data->>'type' in('recycle','adjustment','opening') and to_char(at::timestamptz at time zone 'Asia/Bangkok','YYYY-MM')=to_char(now() at time zone 'Asia/Bangkok','YYYY-MM')),0) monthly
 from waste_bank_records where kind='ledger' and (target_ids is null or student=any(target_ids)) group by student
)
select jsonb_build_object('id',r.id,'name',r.data->'name','number',r.data->'number','grade',r.data->'grade','room',r.data->'room','status',r.status,
 'balance',coalesce(s.balance,0),'earned',coalesce(s.earned,0),'monthly',coalesce(s.monthly,0))
from waste_bank_records r left join scores s on s.student=r.id
where r.kind='students' and (target_ids is null or r.id=any(target_ids)) order by r.id;
$$;
create or replace function public.wb_admin_read(selected_tab text,page_number integer,search_query text,page_size integer)
returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare out jsonb;detail jsonb:='[]';people jsonb:='[]';ids text[];k text;lim int:=least(greatest(page_size,1),100);off int:=greatest(page_number,0)*least(greatest(page_size,1),100);q text:=lower(left(search_query,100));more boolean:=false;begin
 out:=wb_metrics()||jsonb_build_object('students','[]'::jsonb,'submissions','[]'::jsonb,'redemptions','[]'::jsonb,'ledger','[]'::jsonb,'audit','[]'::jsonb,
 'rewards',coalesce((select jsonb_agg(data order by id) from waste_bank_records where kind='rewards' and coalesce(data->>'deletedAt','')=''),'[]'::jsonb));
 if selected_tab='students' then
  select array_agg(id order by id) into ids from (
   select id from waste_bank_records where kind='students' and strpos(lower(concat_ws(' ',data->>'name',id,'ม.'||(data->>'grade')||'/'||(data->>'room'),data->>'grade',data->>'room')),q)>0
   order by id limit lim+1 offset off) p;
  more:=coalesce(array_length(ids,1),0)>lim;
  select coalesce(jsonb_agg(p),'[]') into people from wb_student_scores(coalesce(ids[1:lim],array[]::text[])) p;
 elsif selected_tab in('reviews','pickups','ledger','audit','dashboard') then
  k:=case selected_tab when 'reviews' then 'submissions' when 'pickups' then 'redemptions' when 'dashboard' then 'audit' else selected_tab end;
  select coalesce(jsonb_agg(data order by at desc nulls last,id),'[]') into detail from (
   select r.data,r.at,r.id from waste_bank_records r where r.kind=k
    and (selected_tab<>'reviews' or r.status='Pending') and (selected_tab<>'pickups' or r.status='Pending Pickup')
    and (q='' or strpos(lower(r.data::text),q)>0 or (selected_tab='pickups' and exists(select 1 from waste_bank_records p where p.kind='students' and p.id=r.student and strpos(lower(p.data->>'name'),q)>0)))
   order by r.at desc nulls last,r.id limit case when selected_tab='dashboard' then 5 else lim+1 end offset case when selected_tab='dashboard' then 0 else off end) p;
  more:=jsonb_array_length(detail)>lim;
  if selected_tab<>'dashboard' then select coalesce(jsonb_agg(value order by ord),'[]') into detail from jsonb_array_elements(detail) with ordinality p(value,ord) where ord<=lim;end if;
  out:=out||jsonb_build_object(k,detail);
  select array_agg(distinct p.id) into ids from waste_bank_records p where p.kind='students' and exists(
   select 1 from jsonb_array_elements(detail) d where p.id=d->>'student' or (d->>'actorRole'='student' and p.id=d->>'actorId') or (k='audit' and p.id=d->>'target'));
  select coalesce(jsonb_agg(p),'[]') into people from wb_student_scores(coalesce(ids,array[]::text[])) p;
 end if;
 return out||jsonb_build_object('students',people,'hasMore',more);
end $$;
create or replace function public.wb_public_overview()
returns jsonb language sql stable security invoker set search_path=public as $$
select wb_metrics()||jsonb_build_object(
 'students',coalesce((select jsonb_agg(p order by (p->>'earned')::bigint desc,p->>'id') from (
 select p from wb_student_scores(null) p where p->>'status'='Active' order by (p->>'earned')::bigint desc,p->>'id' limit 3) leaders),'[]'::jsonb),
 'rewards',coalesce((select jsonb_agg(data order by id) from waste_bank_records where kind='rewards' and data->>'enabled'='true' and coalesce(data->>'deletedAt','')=''),'[]'::jsonb));
$$;
revoke all on function public.wb_metrics(),public.wb_student_scores(text[]),public.wb_admin_read(text,integer,text,integer),public.wb_public_overview() from public,anon,authenticated;
grant execute on function public.wb_metrics(),public.wb_student_scores(text[]),public.wb_admin_read(text,integer,text,integer),public.wb_public_overview() to service_role;

create or replace function public.wb_rank_search(search_query text,selected_grade text,selected_room text,monthly boolean)
returns jsonb language sql stable security invoker set search_path=public as $$
with ranked as (
 select p,row_number() over(order by (p->>case when monthly then 'monthly' else 'earned' end)::bigint desc,p->>'id') rank
 from wb_student_scores(null) p where p->>'status'='Active' and (selected_grade='' or p->>'grade'=selected_grade) and (selected_room='' or p->>'room'=selected_room)
)
select coalesce(jsonb_agg(jsonb_build_object('name',split_part(p->>'name',' ',1),'grade',p->'grade','room',p->'room','earned',p->case when monthly then 'monthly' else 'earned' end,'rank',rank) order by rank),'[]') from (
 select * from ranked where search_query<>'' and (p->>'id'=search_query or strpos(p->>'name',search_query)>0) order by rank limit 50) matches;
$$;
revoke all on function public.wb_rank_search(text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.wb_rank_search(text,text,text,boolean) to service_role;
create or replace function public.wb_student_history(student_id text,wallet_page integer,submission_page integer,submission_status text,page_size integer)
returns jsonb language sql stable security invoker set search_path=public as $$
with scores as (
 select student,
 coalesce(sum((data->>'amount')::bigint) filter(where data->>'type' in ('recycle','adjustment','opening')),0) earned
 from waste_bank_records where kind='ledger' group by student
), ranks as (
 select r.id,row_number() over(order by coalesce(s.earned,0) desc,r.id) rank
 from waste_bank_records r left join scores s on s.student=r.id where r.kind='students' and r.status='Active'
), counts as (
 select count(*) total,count(*) filter(where status='Pending') pending,
 count(*) filter(where status='Approved') approved,count(*) filter(where status='Rejected') rejected,
 count(*) filter(where status='Cancelled') cancelled
 from waste_bank_records where kind='submissions' and student=student_id
)
select jsonb_build_object(
 'student',(select p from wb_student_scores(array[student_id]) p),
 'rank',coalesce((select rank from ranks where id=student_id),0),
 'submissionStatusCounts',(select jsonb_build_object('All',total,'Pending',pending,'Approved',approved,'Rejected',rejected,'Cancelled',cancelled) from counts),
 'ledger',coalesce((select jsonb_agg(data order by at desc nulls last,id) from (
 select data,at,id from waste_bank_records where kind='ledger' and student=student_id order by at desc nulls last,id
 limit least(greatest(page_size,1),100)+1 offset greatest(wallet_page,0)*least(greatest(page_size,1),100)) q),'[]'),
 'redemptions',coalesce((select jsonb_agg(data order by at desc nulls last,id) from (
 select data,at,id from waste_bank_records where kind='redemptions' and student=student_id order by at desc nulls last,id
 limit least(greatest(page_size,1),100)+1 offset greatest(wallet_page,0)*least(greatest(page_size,1),100)) q),'[]'),
 'submissions',coalesce((select jsonb_agg(data order by at desc nulls last,id) from (
 select data,at,id from waste_bank_records where kind='submissions' and student=student_id and (submission_status='' or status=submission_status) order by at desc nulls last,id
 limit least(greatest(page_size,1),100)+1 offset greatest(submission_page,0)*least(greatest(page_size,1),100)) q),'[]')
);
$$;
revoke all on function public.wb_student_history(text,integer,integer,text,integer) from public,anon,authenticated;
grant execute on function public.wb_student_history(text,integer,integer,text,integer) to service_role;
create or replace function public.wb_leaderboard(selected_grade text,selected_room text,monthly boolean)
returns jsonb language sql stable security invoker set search_path=public as $$
select coalesce(jsonb_agg(jsonb_build_object('name',split_part(p->>'name',' ',1)||' '||left(split_part(p->>'name',' ',2),1)||'.','grade',p->'grade','room',p->'room','earned',p->'earned','monthly',p->'monthly','rank',rank) order by rank),'[]') from (
 select p,row_number() over(order by (p->>case when monthly then 'monthly' else 'earned' end)::bigint desc,p->>'id') rank
 from wb_student_scores(null) p where p->>'status'='Active' and (selected_grade='' or p->>'grade'=selected_grade) and (selected_room='' or p->>'room'=selected_room)
 order by rank limit 10) leaders;
$$;
revoke all on function public.wb_leaderboard(text,text,boolean) from public,anon,authenticated;
grant execute on function public.wb_leaderboard(text,text,boolean) to service_role;
commit;
