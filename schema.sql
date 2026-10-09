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
