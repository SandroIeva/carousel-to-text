alter table public.ctt_plans add column free_scrapes_used integer not null default 0 check(free_scrapes_used>=0);
-- Carry forward historical reservations, including deleted jobs; usage is not reset.
update public.ctt_plans p set free_scrapes_used=least(2147483647,coalesce((select sum(used) from public.ctt_usage u where u.user_id=p.user_id),0));
create or replace function public.ctt_reserve_job(p_user uuid,p_url text,p_request uuid,p_ip_hash text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare v_id uuid; v_month date; v_day date; v_limit integer; v_used integer; v_last timestamptz; v_daily integer; v_ip integer; v_exempt boolean; v_day_limit integer; v_free boolean; v_trial integer;
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
 insert into public.ctt_plans(user_id) values(p_user) on conflict do nothing;
 select not(i7_plan<>'free' and i7_valid_until>now()),free_scrapes_used into v_free,v_trial from public.ctt_plans where user_id=p_user;
 v_free:=coalesce(v_free,true);
 if v_free and v_trial>=5 then raise exception 'free_trial_exhausted'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ctt-ip:'||p_ip_hash||':'||v_day::text,0));
 insert into public.ctt_daily_usage(user_id,day) values(p_user,v_day) on conflict do nothing;
 insert into public.ctt_ip_usage(ip_hash,day) values(p_ip_hash,v_day) on conflict do nothing;
 select used into v_daily from public.ctt_daily_usage where user_id=p_user and day=v_day for update;
 select used into v_ip from public.ctt_ip_usage where ip_hash=p_ip_hash and day=v_day for update;
 select case when i7_valid_until>now() then case when i7_plan='free' then 5 else daily_limit end else 5 end into v_day_limit from public.ctt_plans where user_id=p_user;
 v_day_limit:=coalesce(v_day_limit,5);
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
 if v_free then update public.ctt_plans set free_scrapes_used=free_scrapes_used+1 where user_id=p_user; end if;
 -- Short retention; successful reservations also prune expired buckets.
 delete from public.ctt_ip_usage where day<v_day-7;
 delete from public.ctt_daily_usage where day<v_day-7;
 return v_id;
end $$;
revoke all on function public.ctt_reserve_job(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.ctt_reserve_job(uuid,text,uuid,text) to service_role;
