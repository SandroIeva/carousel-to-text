begin;
alter table public.ctt_rewrites add column title text check(title is null or (length(title)>0 and length(title)<=200));
commit;
