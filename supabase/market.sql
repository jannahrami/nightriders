
-- ---------------------------------------------------------------------
-- 10) السوق: إعلانات بيع بين الأعضاء (دباب، قطع، ملابس…)
--     لا يراها إلا الأعضاء الفعّالون. الإعلان ينتهي بعد 30 يومًا ويمكن تجديده.
--     حد أقصى 5 إعلانات نشطة لكل عضو. الأدمن يحذف أي إعلان.
-- ---------------------------------------------------------------------

create table if not exists public.listings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 2 and 80),
  price       integer check (price is null or price between 0 and 10000000),   -- null = على السوم
  category    text not null check (category in ('bike','parts','gear','accessories','other')),
  condition   text not null check (condition in ('new','used')),
  description text check (description is null or char_length(description) <= 2000),
  city        text check (city is null or char_length(city) <= 40),
  photos      text[] not null default '{}' check (cardinality(photos) <= 5),
  status      text not null default 'active' check (status in ('active','sold')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '30 days'
);
create index if not exists listings_feed_idx on public.listings (created_at desc);
create index if not exists listings_user_idx on public.listings (user_id);

create or replace function public.listings_guard() returns trigger
language plpgsql set search_path = '' as $$
declare v_client boolean := current_user in ('authenticated', 'anon');
        v_n int;
begin
  -- الصور يجب أن تكون داخل مجلد صاحب الإعلان
  if exists (select 1 from unnest(new.photos) p where p not like new.user_id::text || '/market/%') then
    raise exception 'invalid_photo_path' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' then
    if v_client then
      new.status := 'active';
      new.created_at := now();
      new.expires_at := now() + interval '30 days';
    end if;
  else
    if new.user_id <> old.user_id or new.created_at <> old.created_at then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
    if v_client and new.expires_at is distinct from old.expires_at then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
  end if;
  -- حد الإعلانات النشطة لكل عضو
  if new.status = 'active' and (tg_op = 'INSERT' or old.status <> 'active' or old.expires_at <= now()) then
    select count(*) into v_n from public.listings
      where user_id = new.user_id and status = 'active' and expires_at > now() and id <> new.id;
    if v_n >= 5 then raise exception 'listing_limit' using errcode = '22023'; end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists listings_guard on public.listings;
create trigger listings_guard before insert or update on public.listings
  for each row execute function public.listings_guard();

-- تجديد الإعلان 30 يومًا (لصاحبه فقط)
create or replace function public.renew_listing(p_listing uuid) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare v_until timestamptz := now() + interval '30 days'; v_n int;
begin
  if not public.is_active_member() then raise exception 'members_only' using errcode = '42501'; end if;
  perform 1 from public.listings where id = p_listing and user_id = auth.uid();
  if not found then raise exception 'not_allowed' using errcode = '42501'; end if;
  select count(*) into v_n from public.listings
    where user_id = auth.uid() and status = 'active' and expires_at > now() and id <> p_listing;
  if v_n >= 5 and exists (select 1 from public.listings where id = p_listing and status = 'active' and expires_at <= now()) then
    raise exception 'listing_limit' using errcode = '22023';
  end if;
  update public.listings set expires_at = v_until where id = p_listing;
  return v_until;
end $$;

revoke all on public.listings from anon, authenticated;
grant select, delete on public.listings to authenticated;
grant insert (title, price, category, condition, description, city, photos) on public.listings to authenticated;
grant update (title, price, category, condition, description, city, photos, status) on public.listings to authenticated;
revoke execute on function public.listings_guard() from public, anon, authenticated;
revoke execute on function public.renew_listing(uuid) from public, anon;
grant execute on function public.renew_listing(uuid) to authenticated;

alter table public.listings enable row level security;
drop policy if exists listings_read on public.listings;
create policy listings_read on public.listings for select to authenticated
  using ((select public.is_active_member())
         and (expires_at > now() or user_id = (select auth.uid()) or (select public.is_admin())));
drop policy if exists listings_insert on public.listings;
create policy listings_insert on public.listings for insert to authenticated
  with check ((select public.is_active_member()) and user_id = (select auth.uid()));
drop policy if exists listings_update on public.listings;
create policy listings_update on public.listings for update to authenticated
  using ((select public.is_active_member()) and user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
drop policy if exists listings_delete on public.listings;
create policy listings_delete on public.listings for delete to authenticated
  using ((select public.is_active_member()) and (user_id = (select auth.uid()) or (select public.is_admin())));

do $$ begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'listings') then
    alter publication supabase_realtime add table public.listings;
  end if;
end $$;
