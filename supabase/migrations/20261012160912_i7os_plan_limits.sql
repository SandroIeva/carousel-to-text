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
