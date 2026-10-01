
-- ---------------------------------------------------------------------
-- 11) دليل المحلات: صيانة، قطع غيار، تأجير دبابات، محطات…
--     يضيفها الأعضاء، يعدّلها صاحبها أو الأدمن، ويحذفها صاحبها أو الأدمن.
-- ---------------------------------------------------------------------

create table if not exists public.places (
  id          uuid primary key default gen_random_uuid(),
  created_by  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  category    text not null check (category in ('repair','parts','rental','fuel','other')),
  name        text not null check (char_length(btrim(name)) between 2 and 80),
  phone       text check (phone is null or phone ~ '^\+?[0-9 ]{7,20}$'),
  hours       text check (hours is null or char_length(hours) <= 80),
  notes       text check (notes is null or char_length(notes) <= 500),
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists places_cat_idx on public.places (category);

create or replace function public.places_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.created_by <> old.created_by or new.created_at <> old.created_at) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists places_guard on public.places;
create trigger places_guard before insert or update on public.places
  for each row execute function public.places_guard();

revoke all on public.places from anon, authenticated;
grant select, delete on public.places to authenticated;
grant insert (category, name, phone, hours, notes, lat, lng),
      update (category, name, phone, hours, notes, lat, lng) on public.places to authenticated;
revoke execute on function public.places_guard() from public, anon, authenticated;

alter table public.places enable row level security;
drop policy if exists places_read on public.places;
create policy places_read on public.places for select to authenticated
  using ((select public.is_active_member()));
drop policy if exists places_insert on public.places;
create policy places_insert on public.places for insert to authenticated
  with check ((select public.is_active_member()) and created_by = (select auth.uid()));
drop policy if exists places_update on public.places;
create policy places_update on public.places for update to authenticated
  using ((select public.is_active_member()) and (created_by = (select auth.uid()) or (select public.is_admin())))
  with check ((select public.is_active_member()));
drop policy if exists places_delete on public.places;
create policy places_delete on public.places for delete to authenticated
  using ((select public.is_active_member()) and (created_by = (select auth.uid()) or (select public.is_admin())));
