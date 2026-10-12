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
