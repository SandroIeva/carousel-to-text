begin;
create table public.ctt_plans (
 user_id uuid primary key references auth.users(id) on delete cascade,
 monthly_limit integer not null default 30 check(monthly_limit>=0)
);
create table public.ctt_usage (
 user_id uuid not null references auth.users(id) on delete cascade,
 month date not null,
 used integer not null default 0 check(used>=0),
 last_request timestamptz,
 primary key(user_id,month)
);
create table public.ctt_jobs (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 url text not null,
 status text not null default 'queued' check(status in ('queued','scraping','processing','completed','partial','failed')),
 slides jsonb not null default '[]'::jsonb check(jsonb_typeof(slides)='array' and jsonb_array_length(slides)<=25),
 owner text, caption text, error text,
 apify_run_id text, dataset_id text, scraping_started_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 lease_until timestamptz, lease_token uuid, next_step_at timestamptz not null default now(),
 attempts integer not null default 0,
 unique(user_id,request_id)
);
create index ctt_jobs_user_created on public.ctt_jobs(user_id,created_at desc);
create index ctt_jobs_pending on public.ctt_jobs(next_step_at,created_at) where status in ('queued','scraping','processing');
alter table public.ctt_plans enable row level security;
alter table public.ctt_usage enable row level security;
alter table public.ctt_jobs enable row level security;
revoke all on public.ctt_plans, public.ctt_usage, public.ctt_jobs from public,anon,authenticated;
grant select on public.ctt_plans, public.ctt_usage, public.ctt_jobs to authenticated;
grant delete on public.ctt_jobs to authenticated;
grant all on public.ctt_plans, public.ctt_usage, public.ctt_jobs to service_role;
create policy ctt_plans_owner on public.ctt_plans for select to authenticated using ((select auth.uid())=user_id);
create policy ctt_usage_owner on public.ctt_usage for select to authenticated using ((select auth.uid())=user_id);
create policy ctt_jobs_owner on public.ctt_jobs for select to authenticated using ((select auth.uid())=user_id);
create policy ctt_jobs_delete on public.ctt_jobs for delete to authenticated using ((select auth.uid())=user_id and status in ('completed','partial','failed'));
-- All writes and quota changes happen via the authenticated Next.js server.
-- SECURITY INVOKER: service_role must have the stated grants; no privilege escalation.
create function public.ctt_reserve_job(p_user uuid,p_url text,p_request uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare v_id uuid; v_month date; v_limit integer; v_used integer; v_last timestamptz;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,0));
 select id into v_id from public.ctt_jobs where user_id=p_user and request_id=p_request;
 if v_id is not null then return v_id; end if;
 v_month := pg_catalog.date_trunc('month',now() at time zone 'UTC')::date;
 insert into public.ctt_plans(user_id) values(p_user) on conflict do nothing;
 select monthly_limit into v_limit from public.ctt_plans where user_id=p_user;
 insert into public.ctt_usage(user_id,month) values(p_user,v_month) on conflict do nothing;
 select used,last_request into v_used,v_last from public.ctt_usage where user_id=p_user and month=v_month for update;
 if v_used>=v_limit then raise exception 'quota'; end if;
 if v_last>now()-interval '10 seconds' then raise exception 'rate'; end if;
 if (select count(*) from public.ctt_jobs where user_id=p_user and status in ('queued','scraping','processing'))>=3 then raise exception 'active'; end if;
 insert into public.ctt_jobs(user_id,url,request_id) values(p_user,p_url,p_request) returning id into v_id;
 update public.ctt_usage set used=used+1,last_request=now() where user_id=p_user and month=v_month;
 return v_id;
end $$;
revoke all on function public.ctt_reserve_job(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.ctt_reserve_job(uuid,text,uuid) to service_role;
create function public.ctt_claim_job(p_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_job public.ctt_jobs;
begin
 update public.ctt_jobs set lease_until=now()+interval '120 seconds',lease_token=gen_random_uuid(),attempts=attempts+1,next_step_at=now()+interval '2 seconds'
 where id=p_id and status in ('queued','scraping','processing') and next_step_at<=now() and (lease_until is null or lease_until<now()) returning * into v_job;
 if v_job.id is null then return null; end if;
 return to_jsonb(v_job);
end $$;
revoke all on function public.ctt_claim_job(uuid) from public,anon,authenticated;
grant execute on function public.ctt_claim_job(uuid) to service_role;
commit;

begin;
create table public.ctt_daily_usage (
 user_id uuid not null references auth.users(id) on delete cascade,
 day date not null,
 used integer not null default 0 check (used>=0),
 primary key(user_id,day)
);
create table public.ctt_ip_usage (
 ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
 day date not null,
 used integer not null default 0 check (used>=0),
 primary key(ip_hash,day)
);
create index ctt_daily_usage_day on public.ctt_daily_usage(day);
create index ctt_ip_usage_day on public.ctt_ip_usage(day);
alter table public.ctt_daily_usage enable row level security;
alter table public.ctt_ip_usage enable row level security;
revoke all on public.ctt_daily_usage,public.ctt_ip_usage from public,anon,authenticated;
grant select on public.ctt_daily_usage to authenticated;
grant all on public.ctt_daily_usage,public.ctt_ip_usage to service_role;
create policy ctt_daily_usage_owner on public.ctt_daily_usage for select to authenticated using ((select auth.uid())=user_id);
create policy ctt_ip_usage_server on public.ctt_ip_usage for all to service_role using (true) with check (true);
-- No client policy or grant for IP buckets. Service-role only.
-- Existing retained jobs count towards today's account limit; IP tracking starts now.
insert into public.ctt_daily_usage(user_id,day,used)
select user_id,(created_at at time zone 'Europe/Berlin')::date,count(*)::integer
from public.ctt_jobs where created_at >= (now() at time zone 'Europe/Berlin')::date::timestamp at time zone 'Europe/Berlin'
group by user_id,(created_at at time zone 'Europe/Berlin')::date;
-- Keep legacy clients fail-closed; no three-argument quota bypass.
create or replace function public.ctt_reserve_job(p_user uuid,p_url text,p_request uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
begin raise exception 'ip_required'; end $$;
revoke all on function public.ctt_reserve_job(uuid,text,uuid) from public,anon,authenticated,service_role;
create function public.ctt_reserve_job(p_user uuid,p_url text,p_request uuid,p_ip_hash text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare v_id uuid; v_month date; v_day date; v_limit integer; v_used integer; v_last timestamptz; v_daily integer; v_ip integer;
begin
 if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then raise exception 'ip_required'; end if;
 v_day := (now() at time zone 'Europe/Berlin')::date;
 v_month := pg_catalog.date_trunc('month',now() at time zone 'UTC')::date;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,0));
 select id into v_id from public.ctt_jobs where user_id=p_user and request_id=p_request;
 if v_id is not null then return v_id; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ctt-ip:'||p_ip_hash||':'||v_day::text,0));
 insert into public.ctt_daily_usage(user_id,day) values(p_user,v_day) on conflict do nothing;
 insert into public.ctt_ip_usage(ip_hash,day) values(p_ip_hash,v_day) on conflict do nothing;
 select used into v_daily from public.ctt_daily_usage where user_id=p_user and day=v_day for update;
 select used into v_ip from public.ctt_ip_usage where ip_hash=p_ip_hash and day=v_day for update;
 if v_daily>=3 then raise exception 'daily_user_quota'; end if;
 if v_ip>=3 then raise exception 'daily_ip_quota'; end if;
 insert into public.ctt_plans(user_id) values(p_user) on conflict do nothing;
 select monthly_limit into v_limit from public.ctt_plans where user_id=p_user;
 insert into public.ctt_usage(user_id,month) values(p_user,v_month) on conflict do nothing;
 select used,last_request into v_used,v_last from public.ctt_usage where user_id=p_user and month=v_month for update;
 if v_used>=v_limit then raise exception 'quota'; end if;
 if v_last>now()-interval '10 seconds' then raise exception 'rate'; end if;
 if (select count(*) from public.ctt_jobs where user_id=p_user and status in ('queued','scraping','processing'))>=3 then raise exception 'active'; end if;
 insert into public.ctt_jobs(user_id,url,request_id) values(p_user,p_url,p_request) returning id into v_id;
 update public.ctt_usage set used=used+1,last_request=now() where user_id=p_user and month=v_month;
 update public.ctt_daily_usage set used=used+1 where user_id=p_user and day=v_day;
 update public.ctt_ip_usage set used=used+1 where ip_hash=p_ip_hash and day=v_day;
 -- Short retention; successful reservations also prune expired buckets.
 delete from public.ctt_ip_usage where day<v_day-7;
 delete from public.ctt_daily_usage where day<v_day-7;
 return v_id;
end $$;
revoke all on function public.ctt_reserve_job(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.ctt_reserve_job(uuid,text,uuid,text) to service_role;
commit;

begin;
alter table public.ctt_plans add column quota_exempt boolean not null default false;
-- Existing owner-only SELECT and service-only write grants protect this flag.
create or replace function public.ctt_reserve_job(p_user uuid,p_url text,p_request uuid,p_ip_hash text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare v_id uuid; v_month date; v_day date; v_limit integer; v_used integer; v_last timestamptz; v_daily integer; v_ip integer; v_exempt boolean;
begin
 if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then raise exception 'ip_required'; end if;
 v_day := (now() at time zone 'Europe/Berlin')::date;
 v_month := pg_catalog.date_trunc('month',now() at time zone 'UTC')::date;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,0));
 select id into v_id from public.ctt_jobs where user_id=p_user and request_id=p_request;
 if v_id is not null then return v_id; end if;
 select quota_exempt into v_exempt from public.ctt_plans where user_id=p_user;
 if coalesce(v_exempt,false) then
  insert into public.ctt_jobs(user_id,url,request_id) values(p_user,p_url,p_request) returning id into v_id;
  return v_id;
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ctt-ip:'||p_ip_hash||':'||v_day::text,0));
 insert into public.ctt_daily_usage(user_id,day) values(p_user,v_day) on conflict do nothing;
 insert into public.ctt_ip_usage(ip_hash,day) values(p_ip_hash,v_day) on conflict do nothing;
 select used into v_daily from public.ctt_daily_usage where user_id=p_user and day=v_day for update;
 select used into v_ip from public.ctt_ip_usage where ip_hash=p_ip_hash and day=v_day for update;
 if v_daily>=3 then raise exception 'daily_user_quota'; end if;
 if v_ip>=3 then raise exception 'daily_ip_quota'; end if;
 insert into public.ctt_plans(user_id) values(p_user) on conflict do nothing;
 select monthly_limit into v_limit from public.ctt_plans where user_id=p_user;
 insert into public.ctt_usage(user_id,month) values(p_user,v_month) on conflict do nothing;
 select used,last_request into v_used,v_last from public.ctt_usage where user_id=p_user and month=v_month for update;
 if v_used>=v_limit then raise exception 'quota'; end if;
 if v_last>now()-interval '10 seconds' then raise exception 'rate'; end if;
 if (select count(*) from public.ctt_jobs where user_id=p_user and status in ('queued','scraping','processing'))>=3 then raise exception 'active'; end if;
 insert into public.ctt_jobs(user_id,url,request_id) values(p_user,p_url,p_request) returning id into v_id;
 update public.ctt_usage set used=used+1,last_request=now() where user_id=p_user and month=v_month;
 update public.ctt_daily_usage set used=used+1 where user_id=p_user and day=v_day;
 update public.ctt_ip_usage set used=used+1 where ip_hash=p_ip_hash and day=v_day;
 -- Short retention; successful reservations also prune expired buckets.
 delete from public.ctt_ip_usage where day<v_day-7;
 delete from public.ctt_daily_usage where day<v_day-7;
 return v_id;
end $$;
revoke all on function public.ctt_reserve_job(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.ctt_reserve_job(uuid,text,uuid,text) to service_role;
commit;
begin;
create table public.ctt_rewrites (
 job_id uuid primary key references public.ctt_jobs(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 status text not null check(status in ('generating','ready','failed')),
 angle text not null default '' check(length(angle)<=500),
 slides jsonb not null default '[]'::jsonb check(jsonb_typeof(slides)='array'),
 error text,
 lease_token uuid,
 lease_until timestamptz,
 updated_at timestamptz not null default now()
);
create index ctt_rewrites_owner on public.ctt_rewrites(user_id);
create table public.ctt_rewrite_usage (
 bucket text not null,
 day date not null,
 used integer not null default 0 check(used>=0),
 primary key(bucket,day)
);
alter table public.ctt_rewrites enable row level security;
alter table public.ctt_rewrite_usage enable row level security;
revoke all on public.ctt_rewrites,public.ctt_rewrite_usage from public,anon,authenticated;
grant select on public.ctt_rewrites to authenticated;
grant all on public.ctt_rewrites,public.ctt_rewrite_usage to service_role;
create policy ctt_rewrites_owner on public.ctt_rewrites for select to authenticated using ((select auth.uid())=user_id);
create policy ctt_rewrite_usage_server on public.ctt_rewrite_usage for all to service_role using(true) with check(true);
create function public.ctt_claim_rewrite(p_user uuid,p_job uuid,p_ip text,p_angle text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare v_token uuid:=gen_random_uuid(); v_day date:=(now() at time zone 'Europe/Berlin')::date; v_bucket text; v_exempt boolean;
begin
 if p_ip is null or p_ip !~ '^[0-9a-f]{64}$' or p_angle is null or length(p_angle)>500 then raise exception 'invalid_rewrite'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('rewrite-user:'||p_user::text,0));
 if not exists(select 1 from public.ctt_jobs where id=p_job and user_id=p_user and status in ('completed','partial')) then raise exception 'rewrite_not_found'; end if;
 if exists(select 1 from public.ctt_rewrites where job_id=p_job and status='generating' and lease_until>now()) then raise exception 'rewrite_busy'; end if;
 select quota_exempt into v_exempt from public.ctt_plans where user_id=p_user;
 if not coalesce(v_exempt,false) then
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('rewrite-ip:'||p_ip,0));
  foreach v_bucket in array array['user:'||p_user::text,'ip:'||p_ip] loop
   insert into public.ctt_rewrite_usage(bucket,day) values(v_bucket,v_day) on conflict do nothing;
   if (select used from public.ctt_rewrite_usage where bucket=v_bucket and day=v_day)>=3 then raise exception 'rewrite_quota'; end if;
   update public.ctt_rewrite_usage set used=used+1 where bucket=v_bucket and day=v_day;
  end loop;
 end if;
 insert into public.ctt_rewrites(job_id,user_id,status,angle,lease_token,lease_until) values(p_job,p_user,'generating',p_angle,v_token,now()+interval '90 seconds')
 on conflict(job_id) do update set status='generating',angle=p_angle,error=null,lease_token=v_token,lease_until=now()+interval '90 seconds',updated_at=now();
 delete from public.ctt_rewrite_usage where day<v_day-7;
 return v_token;
end $$;
revoke all on function public.ctt_claim_rewrite(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.ctt_claim_rewrite(uuid,uuid,text,text) to service_role;
commit;

begin;
alter table public.ctt_plans
 add column daily_limit integer not null default 3 check(daily_limit between 3 and 50),
 add column rewrite_limit integer not null default 3 check(rewrite_limit between 3 and 50),
 add column i7_plan text not null default 'free' check(i7_plan in ('free','starter','pro','agency')),
 add column i7_email text,
 add column i7_checked_at timestamptz,
 add column i7_valid_until timestamptz;
create or replace function public.ctt_reserve_job(p_user uuid,p_url text,p_request uuid,p_ip_hash text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare v_id uuid; v_month date; v_day date; v_limit integer; v_used integer; v_last timestamptz; v_daily integer; v_ip integer; v_exempt boolean; v_day_limit integer;
begin
 if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then raise exception 'ip_required'; end if;
 v_day := (now() at time zone 'Europe/Berlin')::date;
 v_month := pg_catalog.date_trunc('month',now() at time zone 'UTC')::date;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,0));
 select id into v_id from public.ctt_jobs where user_id=p_user and request_id=p_request;
 if v_id is not null then return v_id; end if;
 select quota_exempt into v_exempt from public.ctt_plans where user_id=p_user;
 if coalesce(v_exempt,false) then
  insert into public.ctt_jobs(user_id,url,request_id) values(p_user,p_url,p_request) returning id into v_id;
  return v_id;
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ctt-ip:'||p_ip_hash||':'||v_day::text,0));
 insert into public.ctt_daily_usage(user_id,day) values(p_user,v_day) on conflict do nothing;
 insert into public.ctt_ip_usage(ip_hash,day) values(p_ip_hash,v_day) on conflict do nothing;
 select used into v_daily from public.ctt_daily_usage where user_id=p_user and day=v_day for update;
 select used into v_ip from public.ctt_ip_usage where ip_hash=p_ip_hash and day=v_day for update;
 select case when i7_valid_until>now() then daily_limit else 3 end into v_day_limit from public.ctt_plans where user_id=p_user;
 v_day_limit:=coalesce(v_day_limit,3);
 if v_daily>=v_day_limit then raise exception 'daily_user_quota'; end if;
 if v_ip>=v_day_limit then raise exception 'daily_ip_quota'; end if;
 insert into public.ctt_plans(user_id) values(p_user) on conflict do nothing;
 select case when i7_plan<>'free' and (i7_valid_until is null or i7_valid_until<=now()) then 30 else monthly_limit end into v_limit from public.ctt_plans where user_id=p_user;
 insert into public.ctt_usage(user_id,month) values(p_user,v_month) on conflict do nothing;
 select used,last_request into v_used,v_last from public.ctt_usage where user_id=p_user and month=v_month for update;
 if v_used>=v_limit then raise exception 'quota'; end if;
 if v_last>now()-interval '10 seconds' then raise exception 'rate'; end if;
 if (select count(*) from public.ctt_jobs where user_id=p_user and status in ('queued','scraping','processing'))>=3 then raise exception 'active'; end if;
 insert into public.ctt_jobs(user_id,url,request_id) values(p_user,p_url,p_request) returning id into v_id;
 update public.ctt_usage set used=used+1,last_request=now() where user_id=p_user and month=v_month;
 update public.ctt_daily_usage set used=used+1 where user_id=p_user and day=v_day;
 update public.ctt_ip_usage set used=used+1 where ip_hash=p_ip_hash and day=v_day;
 -- Short retention; successful reservations also prune expired buckets.
 delete from public.ctt_ip_usage where day<v_day-7;
 delete from public.ctt_daily_usage where day<v_day-7;
 return v_id;
end $$;
revoke all on function public.ctt_reserve_job(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.ctt_reserve_job(uuid,text,uuid,text) to service_role;
create or replace function public.ctt_claim_rewrite(p_user uuid,p_job uuid,p_ip text,p_angle text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare v_token uuid:=gen_random_uuid(); v_day date:=(now() at time zone 'Europe/Berlin')::date; v_bucket text; v_exempt boolean; v_limit integer;
begin
 if p_ip is null or p_ip !~ '^[0-9a-f]{64}$' or p_angle is null or length(p_angle)>500 then raise exception 'invalid_rewrite'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('rewrite-user:'||p_user::text,0));
 if not exists(select 1 from public.ctt_jobs where id=p_job and user_id=p_user and status in ('completed','partial')) then raise exception 'rewrite_not_found'; end if;
 if exists(select 1 from public.ctt_rewrites where job_id=p_job and status='generating' and lease_until>now()) then raise exception 'rewrite_busy'; end if;
 select quota_exempt into v_exempt from public.ctt_plans where user_id=p_user;
 select case when i7_valid_until>now() then rewrite_limit else 3 end into v_limit from public.ctt_plans where user_id=p_user;
 v_limit:=coalesce(v_limit,3);
 if not coalesce(v_exempt,false) then
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('rewrite-ip:'||p_ip,0));
  foreach v_bucket in array array['user:'||p_user::text,'ip:'||p_ip] loop
   insert into public.ctt_rewrite_usage(bucket,day) values(v_bucket,v_day) on conflict do nothing;
   if (select used from public.ctt_rewrite_usage where bucket=v_bucket and day=v_day)>=v_limit then raise exception 'rewrite_quota'; end if;
   update public.ctt_rewrite_usage set used=used+1 where bucket=v_bucket and day=v_day;
  end loop;
 end if;
 insert into public.ctt_rewrites(job_id,user_id,status,angle,lease_token,lease_until) values(p_job,p_user,'generating',p_angle,v_token,now()+interval '90 seconds')
 on conflict(job_id) do update set status='generating',angle=p_angle,error=null,lease_token=v_token,lease_until=now()+interval '90 seconds',updated_at=now();
 delete from public.ctt_rewrite_usage where day<v_day-7;
 return v_token;
end $$;
revoke all on function public.ctt_claim_rewrite(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.ctt_claim_rewrite(uuid,uuid,text,text) to service_role;
commit;
begin;
alter table public.ctt_rewrites add column title text check(title is null or (length(title)>0 and length(title)<=200));
commit;
create table public.ctt_rewrite_versions (
 id uuid primary key default gen_random_uuid(),
 job_id uuid not null references public.ctt_jobs(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 angle text not null default '' check (length(angle)<=500),
 title text check (length(title) between 1 and 200),
 slides jsonb not null check (jsonb_typeof(slides)='array' and jsonb_array_length(slides)>0),
 created_at timestamptz not null default now()
);
create index ctt_rewrite_versions_job on public.ctt_rewrite_versions(job_id,created_at desc);
create index ctt_rewrite_versions_user on public.ctt_rewrite_versions(user_id);
alter table public.ctt_rewrite_versions enable row level security;
revoke all on public.ctt_rewrite_versions from anon,authenticated;
grant select on public.ctt_rewrite_versions to authenticated;
grant all on public.ctt_rewrite_versions to service_role;
create policy owner_read on public.ctt_rewrite_versions for select to authenticated using ((select auth.uid())=user_id);
insert into public.ctt_rewrite_versions(job_id,user_id,angle,title,slides,created_at)
 select job_id,user_id,angle,title,slides,updated_at from public.ctt_rewrites where jsonb_array_length(slides)>0;
create function public.ctt_finish_rewrite(p_job uuid,p_token uuid,p_title text,p_slides jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare pending public.ctt_rewrites; saved public.ctt_rewrite_versions;
begin
 select * into pending from public.ctt_rewrites where job_id=p_job for update;
 if not found or pending.lease_token is distinct from p_token or pending.status<>'generating' then raise exception 'rewrite_stale'; end if;
 insert into public.ctt_rewrite_versions(job_id,user_id,angle,title,slides) values(p_job,pending.user_id,pending.angle,p_title,p_slides) returning * into saved;
 update public.ctt_rewrites set title=p_title,slides=p_slides,status='ready',error=null,lease_token=null,lease_until=null,updated_at=now() where job_id=p_job;
 return to_jsonb(saved)-'user_id'-'job_id';
end $$;
create function public.ctt_delete_rewrite_version(p_user uuid,p_job uuid,p_version uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare latest public.ctt_rewrite_versions;
begin
 perform 1 from public.ctt_rewrites where job_id=p_job and user_id=p_user for update;
 if not found then return false; end if;
 delete from public.ctt_rewrite_versions where id=p_version and job_id=p_job and user_id=p_user;
 if not found then return false; end if;
 select * into latest from public.ctt_rewrite_versions where job_id=p_job and user_id=p_user order by created_at desc,id desc limit 1;
 update public.ctt_rewrites set title=latest.title,slides=coalesce(latest.slides,'[]'::jsonb),
 status=case when status='generating' then status when latest.id is not null then 'ready' else 'failed' end,
 angle=case when status='generating' then angle else coalesce(latest.angle,'') end,error=null where job_id=p_job and user_id=p_user;
 return true;
end $$;
revoke all on function public.ctt_finish_rewrite(uuid,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.ctt_delete_rewrite_version(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.ctt_finish_rewrite(uuid,uuid,text,jsonb) to service_role;
grant execute on function public.ctt_delete_rewrite_version(uuid,uuid,uuid) to service_role;
begin;

create table public.ctt_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60 and name = btrim(name)),
  created_at timestamptz not null default now(),
  unique (user_id, id)
);
create unique index ctt_folders_user_name on public.ctt_folders (user_id, lower(name));
create index ctt_folders_user_created on public.ctt_folders (user_id, created_at);

alter table public.ctt_jobs add column folder_id uuid;
alter table public.ctt_jobs add constraint ctt_jobs_owner_folder
  foreign key (user_id, folder_id) references public.ctt_folders (user_id, id)
  on delete set null (folder_id);
create index ctt_jobs_user_folder_created on public.ctt_jobs (user_id, folder_id, created_at desc);

alter table public.ctt_folders enable row level security;
revoke all on public.ctt_folders from public, anon, authenticated;
grant select on public.ctt_folders to authenticated;
grant all on public.ctt_folders to service_role;
create policy ctt_folders_owner on public.ctt_folders
  for select to authenticated using ((select auth.uid()) = user_id);

commit;
