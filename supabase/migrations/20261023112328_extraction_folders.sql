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
