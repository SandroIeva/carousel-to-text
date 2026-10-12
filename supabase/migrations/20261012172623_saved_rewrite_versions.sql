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
