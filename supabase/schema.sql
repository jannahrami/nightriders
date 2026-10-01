-- =====================================================================
--  NightRiders — Supabase schema, RLS policies, RPC functions, storage
--  شغّل هذا الملف مرة واحدة في SQL Editor لمشروع Supabase جديد.
--  (آمن لإعادة التشغيل: يستخدم IF NOT EXISTS و CREATE OR REPLACE)
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 1) الجداول
-- ---------------------------------------------------------------------

create table if not exists public.invites (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[A-Z0-9]{10}$'),
  note        text check (char_length(note) <= 80),
  max_uses    int  not null default 1 check (max_uses between 1 and 50),
  uses        int  not null default 0 check (uses >= 0),
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  created_by  uuid,
  created_at  timestamptz not null default now()
);

create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  display_name    text not null check (char_length(btrim(display_name)) between 2 and 40),
  avatar_path     text,
  city            text check (char_length(city) <= 40),
  bike_type       text check (char_length(bike_type) <= 40),
  bike_model      text check (char_length(bike_model) <= 40),
  bike_photo_path text,
  riding_style    text check (riding_style in ('calm','touring','long_distance','sport','offroad')),
  ready_until     timestamptz,
  role            text not null default 'member' check (role in ('member','admin','owner')),
  status          text not null default 'pending' check (status in ('pending','active','suspended')),
  invite_id       uuid references public.invites(id) on delete set null,
  approved_at     timestamptz,
  approved_by     uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (avatar_path is null or avatar_path like id::text || '/%'),
  check (bike_photo_path is null or bike_photo_path like id::text || '/%')
);
-- مالك (أدمن أساسي) واحد فقط
create unique index if not exists profiles_single_owner on public.profiles ((true)) where role = 'owner';

do $$ begin
  alter table public.invites
    add constraint invites_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;
exception when duplicate_object then null; end $$;

-- رقم التواصل في جدول منفصل حتى لا يظهر إلا بموافقة صاحبه
create table if not exists public.member_contacts (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  phone      text check (phone ~ '^\+?[0-9 ]{7,20}$'),
  show_phone boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(btrim(title)) between 2 and 100),
  body       text check (char_length(body) <= 2000),
  pinned     boolean not null default true,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rides (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (char_length(btrim(title)) between 3 and 80),
  description   text check (char_length(description) <= 2000),
  status        text not null default 'planned' check (status in ('planned','ongoing','completed','cancelled')),
  organizer_id  uuid references public.profiles(id) on delete set null,
  created_by    uuid default auth.uid() references public.profiles(id) on delete set null,
  meet_at       timestamptz not null,
  depart_at     timestamptz,
  return_at     timestamptz,
  meet_name     text not null check (char_length(btrim(meet_name)) between 2 and 120),
  meet_lat      double precision check (meet_lat between -90 and 90),
  meet_lng      double precision check (meet_lng between -180 and 180),
  dest_name     text check (char_length(dest_name) <= 120),
  dest_lat      double precision check (dest_lat between -90 and 90),
  dest_lng      double precision check (dest_lng between -180 and 180),
  distance_km   numeric(7,1) check (distance_km >= 0),
  route_geojson jsonb check (route_geojson is null or pg_column_size(route_geojson) < 300000),
  leader_id     uuid references public.profiles(id) on delete set null,
  sweep_id      uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check ((meet_lat is null) = (meet_lng is null)),
  check ((dest_lat is null) = (dest_lng is null)),
  check (depart_at is null or depart_at >= meet_at),
  check (return_at is null or return_at >= coalesce(depart_at, meet_at)),
  check (leader_id is null or sweep_id is null or leader_id <> sweep_id)
);
create index if not exists rides_meet_at_idx on public.rides (meet_at);

create table if not exists public.ride_stops (
  id         uuid primary key default gen_random_uuid(),
  ride_id    uuid not null references public.rides(id) on delete cascade,
  kind       text not null check (kind in ('fuel','rest','other')),
  name       text not null check (char_length(btrim(name)) between 1 and 80),
  lat        double precision not null check (lat between -90 and 90),
  lng        double precision not null check (lng between -180 and 180),
  position   smallint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ride_stops_ride_idx on public.ride_stops (ride_id, position);

create table if not exists public.ride_participants (
  ride_id     uuid not null references public.rides(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  rsvp        text not null check (rsvp in ('going','maybe','declined')),
  rsvp_at     timestamptz not null default now(),
  progress    text check (progress in ('on_way','arrived','returned')),
  progress_at timestamptz,
  primary key (ride_id, user_id),
  check (progress is null or rsvp = 'going')
);
create index if not exists ride_participants_user_idx on public.ride_participants (user_id);

create table if not exists public.polls (
  id         uuid primary key default gen_random_uuid(),
  ride_id    uuid references public.rides(id) on delete cascade,
  question   text not null check (char_length(btrim(question)) between 3 and 140),
  kind       text not null default 'other' check (kind in ('destination','time','other')),
  created_by uuid references public.profiles(id) on delete set null,
  closes_at  timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists polls_ride_idx on public.polls (ride_id);

create table if not exists public.poll_options (
  id          uuid primary key default gen_random_uuid(),
  poll_id     uuid not null references public.polls(id) on delete cascade,
  label       text not null check (char_length(btrim(label)) between 1 and 100),
  option_time timestamptz,
  position    smallint not null default 0,
  unique (id, poll_id)
);

create table if not exists public.poll_votes (
  poll_id   uuid not null references public.polls(id) on delete cascade,
  option_id uuid not null,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  voted_at  timestamptz not null default now(),
  primary key (poll_id, user_id),                          -- صوت واحد لكل عضو في كل تصويت
  foreign key (option_id, poll_id) references public.poll_options(id, poll_id) on delete cascade
);

create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  ride_id    uuid references public.rides(id) on delete cascade,   -- NULL = الشات العام
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  client_id  uuid not null,                                         -- يمنع تكرار الرسالة
  body       text check (char_length(body) <= 2000),
  image_path text,
  created_at timestamptz not null default now(),
  unique (user_id, client_id),
  check (char_length(btrim(coalesce(body, ''))) > 0 or image_path is not null),
  check (image_path is null or image_path like user_id::text || '/chat/%')
);
create index if not exists messages_channel_idx on public.messages (ride_id, created_at desc);

-- الموقع الحالي فقط (صف واحد لكل عضو) — لا يوجد سجل تحركات
create table if not exists public.member_locations (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  accuracy_m  real check (accuracy_m >= 0),
  heading     real,
  speed_mps   real,
  ride_id     uuid references public.rides(id) on delete cascade,
  share_until timestamptz not null,
  updated_at  timestamptz not null default now()
);

create table if not exists public.help_requests (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind                text not null check (kind in ('flat_tire','breakdown','fuel','other')),
  description         text check (char_length(description) <= 500),
  lat                 double precision check (lat between -90 and 90),
  lng                 double precision check (lng between -180 and 180),
  location_accuracy_m real,
  status              text not null default 'open' check (status in ('open','resolved')),
  resolved_at         timestamptz,
  resolved_by         uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  check ((lat is null) = (lng is null))
);
-- طلب مفتوح واحد لكل عضو (يمنع التكرار عند الضغط مرتين)
create unique index if not exists help_one_open_per_user on public.help_requests (user_id) where status = 'open';

create table if not exists public.help_responders (
  request_id uuid not null references public.help_requests(id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (request_id, user_id)
);

create table if not exists public.ride_media (
  id         uuid primary key default gen_random_uuid(),
  ride_id    uuid not null references public.rides(id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  path       text not null unique,
  kind       text not null check (kind in ('image','video')),
  mime       text not null check (mime in ('image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 52428800),
  created_at timestamptz not null default now(),
  check (path like user_id::text || '/rides/' || ride_id::text || '/%'),
  check ((kind = 'image') = (mime like 'image/%'))
);
create index if not exists ride_media_ride_idx on public.ride_media (ride_id, created_at desc);

-- ---------------------------------------------------------------------
-- 2) دوال مساعدة للصلاحيات (تقرأ الحالة من قاعدة البيانات في كل طلب)
-- ---------------------------------------------------------------------

create or replace function public.is_active_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'active');
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and status = 'active' and role in ('admin','owner'));
$$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and status = 'active' and role = 'owner');
$$;

create or replace function public.my_status() returns text
language sql stable security definer set search_path = '' as $$
  select status from public.profiles where id = auth.uid();
$$;

create or replace function public.can_manage_ride(p_ride uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or (
    public.is_active_member() and exists (
      select 1 from public.rides r
      where r.id = p_ride and (r.organizer_id = auth.uid() or r.created_by = auth.uid())));
$$;

-- ---------------------------------------------------------------------
-- 3) Triggers للتحقق وحماية الحقول الحساسة
-- ---------------------------------------------------------------------

-- يمنع أي مستخدم من تغيير دوره أو حالته بنفسه (حتى لو تغيّرت صلاحيات الأعمدة لاحقًا)
create or replace function public.profiles_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.id <> old.id
       or new.role        is distinct from old.role
       or new.status      is distinct from old.status
       or new.invite_id   is distinct from old.invite_id
       or new.approved_at is distinct from old.approved_at
       or new.approved_by is distinct from old.approved_by
       or new.created_at  is distinct from old.created_at then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
  end if;
  if new.ready_until is distinct from old.ready_until
     and new.ready_until is not null
     and new.ready_until > now() + interval '12 hours' then
    raise exception 'ready_too_long' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists contacts_touch on public.member_contacts;
create trigger contacts_touch before insert or update on public.member_contacts
  for each row execute function public.touch_updated_at();
drop trigger if exists announcements_touch on public.announcements;
create trigger announcements_touch before update on public.announcements
  for each row execute function public.touch_updated_at();

-- الطلعات: المنظّم، قائد الطلعة وآخر الركب
create or replace function public.rides_guard() returns trigger
language plpgsql set search_path = '' as $$
-- ليست security definer عمدًا: current_user يوضح هل التعديل من العميل أم من دالة داخلية
declare v_client boolean := current_user in ('authenticated', 'anon');
begin
  if tg_op = 'INSERT' then
    if v_client then
      new.created_by := auth.uid();
      if new.organizer_id is null then new.organizer_id := auth.uid(); end if;
      if new.organizer_id <> auth.uid() and not public.is_admin() then
        raise exception 'organizer_not_allowed' using errcode = '42501';
      end if;
      new.status := 'planned';
    end if;
    new.leader_id := null;            -- يُختاران من المشاركين بعد انضمامهم
    new.sweep_id  := null;
  else
    if v_client then
      if new.created_by is distinct from old.created_by or new.created_at <> old.created_at then
        raise exception 'not_allowed' using errcode = '42501';
      end if;
      if new.organizer_id is distinct from old.organizer_id and not public.is_admin() then
        raise exception 'organizer_not_allowed' using errcode = '42501';
      end if;
    end if;
    if new.leader_id is not null and new.leader_id is distinct from old.leader_id and not exists (
         select 1 from public.ride_participants p
         where p.ride_id = new.id and p.user_id = new.leader_id and p.rsvp = 'going') then
      raise exception 'leader_must_be_participant' using errcode = '22023';
    end if;
    if new.sweep_id is not null and new.sweep_id is distinct from old.sweep_id and not exists (
         select 1 from public.ride_participants p
         where p.ride_id = new.id and p.user_id = new.sweep_id and p.rsvp = 'going') then
      raise exception 'sweep_must_be_participant' using errcode = '22023';
    end if;
  end if;
  if new.organizer_id is not null
     and (tg_op = 'INSERT' or new.organizer_id is distinct from old.organizer_id)
     and not exists (select 1 from public.profiles where id = new.organizer_id and status = 'active') then
    raise exception 'organizer_not_active' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists rides_guard on public.rides;
create trigger rides_guard before insert or update on public.rides
  for each row execute function public.rides_guard();

-- المنظّم يُضاف تلقائيًا كمشارك، وعند انتهاء الطلعة تُحذف المواقع المرتبطة بها
create or replace function public.rides_after() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.organizer_id is not null then
    insert into public.ride_participants (ride_id, user_id, rsvp)
    values (new.id, new.organizer_id, 'going') on conflict do nothing;
  end if;
  if tg_op = 'UPDATE' and new.status in ('completed','cancelled') and old.status is distinct from new.status then
    delete from public.member_locations where ride_id = new.id;
  end if;
  return null;
end $$;

drop trigger if exists rides_after on public.rides;
create trigger rides_after after insert or update on public.rides
  for each row execute function public.rides_after();

create or replace function public.participants_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.rsvp <> 'going' then new.progress := null; end if;
  if tg_op = 'INSERT' or new.rsvp is distinct from old.rsvp then new.rsvp_at := now(); end if;
  if tg_op = 'INSERT' then
    new.progress_at := case when new.progress is null then null else now() end;
  elsif new.progress is distinct from old.progress then
    new.progress_at := case when new.progress is null then null else now() end;
  end if;
  return new;
end $$;

drop trigger if exists participants_guard on public.ride_participants;
create trigger participants_guard before insert or update on public.ride_participants
  for each row execute function public.participants_guard();

-- إذا اعتذر قائد الطلعة أو آخر الركب، يُلغى تعيينه
create or replace function public.participants_after() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_ride uuid; v_user uuid;
begin
  if tg_op = 'DELETE' then v_ride := old.ride_id; v_user := old.user_id;
  elsif new.rsvp <> 'going' then v_ride := new.ride_id; v_user := new.user_id;
  else return null; end if;
  update public.rides set leader_id = null where id = v_ride and leader_id = v_user;
  update public.rides set sweep_id  = null where id = v_ride and sweep_id  = v_user;
  return null;
end $$;

drop trigger if exists participants_after on public.ride_participants;
create trigger participants_after after update or delete on public.ride_participants
  for each row execute function public.participants_after();

-- المواقع: الوقت من الخادم، حد أقصى للمدة، وحذف المنتهي
create or replace function public.locations_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if new.share_until <= now() then
    raise exception 'share_until_past' using errcode = '22023';
  end if;
  if new.share_until > now() + interval '12 hours 10 minutes' then   -- 12 ساعة + هامش لفرق ساعة الجوال
    raise exception 'share_too_long' using errcode = '22023';
  end if;
  return new;
end $$;

drop trigger if exists locations_guard on public.member_locations;
create trigger locations_guard before insert or update on public.member_locations
  for each row execute function public.locations_guard();

create or replace function public.purge_expired_locations() returns void
language sql security definer set search_path = '' as $$
  delete from public.member_locations where share_until <= now();
$$;

create or replace function public.locations_purge_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.member_locations where share_until <= now();
  return null;
end $$;

drop trigger if exists locations_purge on public.member_locations;
create trigger locations_purge after insert or update on public.member_locations
  for each statement execute function public.locations_purge_trigger();

-- ---------------------------------------------------------------------
-- 4) دوال RPC (كل دالة تتحقق من الصلاحية بنفسها)
-- ---------------------------------------------------------------------

-- إعداد الأدمن الأساسي: لا تُستدعى إلا من SQL Editor، وتعمل مرة واحدة فقط
create or replace function public.bootstrap_owner(p_email text, p_display_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid;
begin
  select id into v_uid from auth.users where lower(email) = lower(btrim(p_email));
  if v_uid is null then raise exception 'user_not_found: سجّل الحساب من التطبيق أولًا'; end if;
  if exists (select 1 from public.profiles where role = 'owner') then
    raise exception 'owner_exists: يوجد أدمن أساسي مسبقًا';
  end if;
  insert into public.profiles (id, display_name, role, status, approved_at)
  values (v_uid, btrim(p_display_name), 'owner', 'active', now())
  on conflict (id) do update set role = 'owner', status = 'active', approved_at = now(),
                                 display_name = excluded.display_name;
  return v_uid;
end $$;

create or replace function public.check_invite(p_code text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.invites
                 where code = upper(btrim(p_code)) and revoked_at is null
                   and expires_at > now() and uses < max_uses);
$$;

create or replace function public.redeem_invite(p_code text, p_display_name text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_status text; v_inv public.invites;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select status into v_status from public.profiles where id = v_uid;
  if v_status is not null then
    if v_status = 'suspended' then raise exception 'account_suspended' using errcode = '42501'; end if;
    return v_status;
  end if;
  select * into v_inv from public.invites where code = upper(btrim(p_code)) for update;
  if v_inv.id is null or v_inv.revoked_at is not null or v_inv.expires_at <= now() or v_inv.uses >= v_inv.max_uses then
    raise exception 'invalid_invite' using errcode = '22023';
  end if;
  insert into public.profiles (id, display_name, invite_id, status, approved_at)
  values (v_uid, btrim(p_display_name), v_inv.id, 'active', now());
  update public.invites set uses = uses + 1 where id = v_inv.id;
  return 'active';
end $$;

-- تسجيل مفتوح بدون دعوة: الحساب الجديد يدخل مباشرة (نشط)، والأدمن يقدر يوقفه لاحقًا
create or replace function public.request_join(p_display_name text, p_bike_type text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_status text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select status into v_status from public.profiles where id = v_uid;
  if v_status is not null then
    if v_status = 'suspended' then raise exception 'account_suspended' using errcode = '42501'; end if;
    return v_status;
  end if;
  insert into public.profiles (id, display_name, bike_type, status, approved_at)
  values (v_uid, btrim(p_display_name), nullif(btrim(coalesce(p_bike_type, '')), ''), 'active', now());
  return 'active';
end $$;

create or replace function public.create_invite(p_hours int default 72, p_max_uses int default 1, p_note text default null)
returns public.invites
language plpgsql security definer set search_path = '' as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea; v_code text; v_row public.invites; i int;
begin
  if not public.is_admin() then raise exception 'admin_only' using errcode = '42501'; end if;
  if p_hours not between 1 and 720 then raise exception 'invalid_duration' using errcode = '22023'; end if;
  loop
    v_bytes := extensions.gen_random_bytes(10);
    v_code := '';
    for i in 0..9 loop
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.invites where code = v_code);
  end loop;
  insert into public.invites (code, note, max_uses, expires_at, created_by)
  values (v_code, nullif(btrim(p_note), ''), p_max_uses, now() + make_interval(hours => p_hours), auth.uid())
  returning * into v_row;
  return v_row;
end $$;

create or replace function public.revoke_invite(p_invite uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'admin_only' using errcode = '42501'; end if;
  update public.invites set revoked_at = now() where id = p_invite and revoked_at is null;
end $$;

create or replace function public.approve_member(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'admin_only' using errcode = '42501'; end if;
  update public.profiles set status = 'active', approved_at = now(), approved_by = auth.uid()
  where id = p_user and status in ('pending','suspended');
  if not found then raise exception 'member_not_found' using errcode = '22023'; end if;
end $$;

create or replace function public.suspend_member(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_role text;
begin
  if not public.is_admin() then raise exception 'admin_only' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'cannot_suspend_self' using errcode = '22023'; end if;
  select role into v_role from public.profiles where id = p_user;
  if v_role is null then raise exception 'member_not_found' using errcode = '22023'; end if;
  if v_role = 'owner' then raise exception 'cannot_suspend_owner' using errcode = '42501'; end if;
  if v_role = 'admin' and not public.is_owner() then raise exception 'owner_only' using errcode = '42501'; end if;
  update public.profiles set status = 'suspended', role = 'member', ready_until = null where id = p_user;
  delete from public.member_locations where user_id = p_user;
end $$;

create or replace function public.set_admin(p_user uuid, p_is_admin boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'owner_only' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'cannot_change_self' using errcode = '22023'; end if;
  update public.profiles set role = case when p_is_admin then 'admin' else 'member' end
  where id = p_user and status = 'active' and role <> 'owner';
  if not found then raise exception 'member_not_found' using errcode = '22023'; end if;
end $$;

create or replace function public.set_rsvp(p_ride uuid, p_rsvp text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  if not public.is_active_member() then raise exception 'members_only' using errcode = '42501'; end if;
  if p_rsvp not in ('going','maybe','declined') then raise exception 'invalid_rsvp' using errcode = '22023'; end if;
  select status into v_status from public.rides where id = p_ride;
  if v_status is null then raise exception 'ride_not_found' using errcode = '22023'; end if;
  if v_status not in ('planned','ongoing') then raise exception 'ride_closed' using errcode = '22023'; end if;
  insert into public.ride_participants (ride_id, user_id, rsvp) values (p_ride, auth.uid(), p_rsvp)
  on conflict (ride_id, user_id) do update set rsvp = excluded.rsvp;
end $$;

create or replace function public.set_progress(p_ride uuid, p_progress text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  if not public.is_active_member() then raise exception 'members_only' using errcode = '42501'; end if;
  if p_progress is not null and p_progress not in ('on_way','arrived','returned') then
    raise exception 'invalid_progress' using errcode = '22023';
  end if;
  select status into v_status from public.rides where id = p_ride;
  if v_status is null or v_status = 'cancelled' then raise exception 'ride_closed' using errcode = '22023'; end if;
  update public.ride_participants set progress = p_progress
  where ride_id = p_ride and user_id = auth.uid() and rsvp = 'going';
  if not found then raise exception 'not_going' using errcode = '22023'; end if;
end $$;

create or replace function public.create_poll(p_ride uuid, p_question text, p_kind text,
                                              p_closes_at timestamptz, p_options jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_poll uuid; v_opt jsonb; v_pos int := 0;
begin
  if not public.is_active_member() then raise exception 'members_only' using errcode = '42501'; end if;
  if p_ride is not null and not public.can_manage_ride(p_ride) then
    raise exception 'ride_managers_only' using errcode = '42501';
  end if;
  if jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) not between 2 and 8 then
    raise exception 'poll_needs_2_to_8_options' using errcode = '22023';
  end if;
  if p_closes_at is not null and p_closes_at <= now() then
    raise exception 'closes_at_past' using errcode = '22023';
  end if;
  insert into public.polls (ride_id, question, kind, created_by, closes_at)
  values (p_ride, btrim(p_question), coalesce(p_kind, 'other'), auth.uid(), p_closes_at)
  returning id into v_poll;
  for v_opt in select * from jsonb_array_elements(p_options) loop
    insert into public.poll_options (poll_id, label, option_time, position)
    values (v_poll, btrim(v_opt->>'label'), nullif(v_opt->>'time', '')::timestamptz, v_pos);
    v_pos := v_pos + 1;
  end loop;
  return v_poll;
end $$;

create or replace function public.close_poll(p_poll uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.polls set closes_at = now()
  where id = p_poll and (closes_at is null or closes_at > now())
    and public.is_active_member() and (created_by = auth.uid() or public.is_admin());
  if not found then raise exception 'not_allowed' using errcode = '42501'; end if;
end $$;

create or replace function public.cast_vote(p_poll uuid, p_option uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_closes timestamptz; v_exists boolean;
begin
  if not public.is_active_member() then raise exception 'members_only' using errcode = '42501'; end if;
  select true, closes_at into v_exists, v_closes from public.polls where id = p_poll;
  if v_exists is null then raise exception 'poll_not_found' using errcode = '22023'; end if;
  if v_closes is not null and v_closes <= now() then raise exception 'poll_closed' using errcode = '22023'; end if;
  insert into public.poll_votes (poll_id, option_id, user_id) values (p_poll, p_option, auth.uid())
  on conflict (poll_id, user_id) do update set option_id = excluded.option_id, voted_at = now();
end $$;

create or replace function public.retract_vote(p_poll uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_member() then raise exception 'members_only' using errcode = '42501'; end if;
  if exists (select 1 from public.polls where id = p_poll and closes_at is not null and closes_at <= now()) then
    raise exception 'poll_closed' using errcode = '22023';
  end if;
  delete from public.poll_votes where poll_id = p_poll and user_id = auth.uid();
end $$;

create or replace function public.share_location(p_lat double precision, p_lng double precision,
    p_accuracy real, p_heading real, p_speed real, p_ride uuid, p_share_until timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_member() then raise exception 'members_only' using errcode = '42501'; end if;
  if p_ride is not null and not exists (
       select 1 from public.rides where id = p_ride and status in ('planned','ongoing')) then
    raise exception 'ride_closed' using errcode = '22023';
  end if;
  insert into public.member_locations (user_id, lat, lng, accuracy_m, heading, speed_mps, ride_id, share_until)
  values (auth.uid(), p_lat, p_lng, p_accuracy, p_heading, p_speed, p_ride, p_share_until)
  on conflict (user_id) do update set lat = excluded.lat, lng = excluded.lng,
    accuracy_m = excluded.accuracy_m, heading = excluded.heading, speed_mps = excluded.speed_mps,
    ride_id = excluded.ride_id, share_until = excluded.share_until;
end $$;

create or replace function public.stop_location_sharing() returns void
language sql security definer set search_path = '' as $$
  delete from public.member_locations where user_id = auth.uid();
$$;

create or replace function public.resolve_help(p_request uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_member() then raise exception 'members_only' using errcode = '42501'; end if;
  update public.help_requests h set status = 'resolved', resolved_at = now(), resolved_by = auth.uid()
  where h.id = p_request and h.status = 'open'
    and (h.user_id = auth.uid() or public.is_admin()
         or exists (select 1 from public.help_responders r where r.request_id = h.id and r.user_id = auth.uid()));
  if not found then raise exception 'not_allowed' using errcode = '42501'; end if;
end $$;

-- ---------------------------------------------------------------------
-- 5) الصلاحيات (GRANT) — Supabase يمنح كل شيء افتراضيًا، لذا نسحب ثم نمنح بدقة
-- ---------------------------------------------------------------------

revoke all on public.invites, public.profiles, public.member_contacts, public.announcements,
  public.rides, public.ride_stops, public.ride_participants, public.polls, public.poll_options,
  public.poll_votes, public.messages, public.member_locations, public.help_requests,
  public.help_responders, public.ride_media
from anon, authenticated;

grant select on public.invites to authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, avatar_path, city, bike_type, bike_model, bike_photo_path, riding_style, ready_until)
  on public.profiles to authenticated;
grant select, delete on public.member_contacts to authenticated;
grant insert (user_id, phone, show_phone), update (user_id, phone, show_phone) on public.member_contacts to authenticated;
grant select, delete on public.announcements to authenticated;
grant insert (title, body, pinned), update (title, body, pinned) on public.announcements to authenticated;
grant select, delete on public.rides to authenticated;
grant insert (title, description, organizer_id, meet_at, depart_at, return_at, meet_name, meet_lat, meet_lng,
              dest_name, dest_lat, dest_lng, distance_km, route_geojson)
  on public.rides to authenticated;
grant update (title, description, organizer_id, status, meet_at, depart_at, return_at, meet_name, meet_lat, meet_lng,
              dest_name, dest_lat, dest_lng, distance_km, route_geojson, leader_id, sweep_id)
  on public.rides to authenticated;
grant select, delete on public.ride_stops to authenticated;
grant insert (ride_id, kind, name, lat, lng, position), update (kind, name, lat, lng, position)
  on public.ride_stops to authenticated;
grant select, delete on public.ride_participants to authenticated;
grant select, delete on public.polls to authenticated;
grant select on public.poll_options to authenticated;
grant select on public.poll_votes to authenticated;
grant select, delete on public.messages to authenticated;
grant insert (ride_id, client_id, body, image_path) on public.messages to authenticated;
grant select, delete on public.member_locations to authenticated;
grant select, delete on public.help_requests to authenticated;
grant insert (kind, description, lat, lng, location_accuracy_m) on public.help_requests to authenticated;
grant select, delete on public.help_responders to authenticated;
grant insert (request_id) on public.help_responders to authenticated;
grant select, delete on public.ride_media to authenticated;
grant insert (ride_id, path, kind, mime, size_bytes) on public.ride_media to authenticated;

-- الدوال: نسحب التنفيذ الافتراضي ثم نمنح ما يلزم فقط
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.check_invite(text) to anon, authenticated;
grant execute on function
  public.is_active_member(), public.is_admin(), public.is_owner(), public.my_status(), public.can_manage_ride(uuid),
  public.redeem_invite(text, text), public.request_join(text, text), public.create_invite(int, int, text), public.revoke_invite(uuid),
  public.approve_member(uuid), public.suspend_member(uuid), public.set_admin(uuid, boolean),
  public.set_rsvp(uuid, text), public.set_progress(uuid, text),
  public.create_poll(uuid, text, text, timestamptz, jsonb), public.close_poll(uuid),
  public.cast_vote(uuid, uuid), public.retract_vote(uuid),
  public.share_location(double precision, double precision, real, real, real, uuid, timestamptz),
  public.stop_location_sharing(), public.resolve_help(uuid)
to authenticated;
-- bootstrap_owner و purge_expired_locations: لا تُمنح لأي دور عام (SQL Editor أو service_role فقط)
revoke execute on function public.bootstrap_owner(text, text) from service_role;

-- ---------------------------------------------------------------------
-- 6) سياسات RLS
-- ---------------------------------------------------------------------

alter table public.invites           enable row level security;
alter table public.profiles          enable row level security;
alter table public.member_contacts   enable row level security;
alter table public.announcements     enable row level security;
alter table public.rides             enable row level security;
alter table public.ride_stops        enable row level security;
alter table public.ride_participants enable row level security;
alter table public.polls             enable row level security;
alter table public.poll_options      enable row level security;
alter table public.poll_votes        enable row level security;
alter table public.messages          enable row level security;
alter table public.member_locations  enable row level security;
alter table public.help_requests     enable row level security;
alter table public.help_responders   enable row level security;
alter table public.ride_media        enable row level security;

-- الدعوات: للأدمن فقط (الإنشاء والإلغاء عبر RPC)
drop policy if exists invites_admin_read on public.invites;
create policy invites_admin_read on public.invites for select to authenticated
  using ((select public.is_admin()));

-- الملفات الشخصية
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid())
         or (select public.is_admin())
         or ((select public.is_active_member()) and status <> 'pending'));
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid()) and status <> 'suspended')
  with check (id = (select auth.uid()) and status <> 'suspended');

-- رقم التواصل
drop policy if exists contacts_read on public.member_contacts;
create policy contacts_read on public.member_contacts for select to authenticated
  using (user_id = (select auth.uid())
         or ((select public.is_active_member()) and show_phone and phone is not null));
drop policy if exists contacts_insert on public.member_contacts;
create policy contacts_insert on public.member_contacts for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.my_status()) in ('active','pending'));
drop policy if exists contacts_update on public.member_contacts;
create policy contacts_update on public.member_contacts for update to authenticated
  using (user_id = (select auth.uid()) and (select public.my_status()) in ('active','pending'))
  with check (user_id = (select auth.uid()));
drop policy if exists contacts_delete on public.member_contacts;
create policy contacts_delete on public.member_contacts for delete to authenticated
  using (user_id = (select auth.uid()));

-- الإعلانات
drop policy if exists ann_read on public.announcements;
create policy ann_read on public.announcements for select to authenticated
  using ((select public.is_active_member()));
drop policy if exists ann_admin_insert on public.announcements;
create policy ann_admin_insert on public.announcements for insert to authenticated
  with check ((select public.is_admin()) and created_by = (select auth.uid()));
drop policy if exists ann_admin_update on public.announcements;
create policy ann_admin_update on public.announcements for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists ann_admin_delete on public.announcements;
create policy ann_admin_delete on public.announcements for delete to authenticated
  using ((select public.is_admin()));

-- الطلعات
drop policy if exists rides_read on public.rides;
create policy rides_read on public.rides for select to authenticated
  using ((select public.is_active_member()));
drop policy if exists rides_insert on public.rides;
create policy rides_insert on public.rides for insert to authenticated
  with check ((select public.is_active_member()));
drop policy if exists rides_update on public.rides;
create policy rides_update on public.rides for update to authenticated
  using ((select public.is_active_member())
         and ((select public.is_admin()) or organizer_id = (select auth.uid()) or created_by = (select auth.uid())))
  with check ((select public.is_active_member()));
drop policy if exists rides_delete on public.rides;
create policy rides_delete on public.rides for delete to authenticated
  using ((select public.is_admin()));

drop policy if exists stops_read on public.ride_stops;
create policy stops_read on public.ride_stops for select to authenticated
  using ((select public.is_active_member()));
drop policy if exists stops_insert on public.ride_stops;
create policy stops_insert on public.ride_stops for insert to authenticated
  with check (public.can_manage_ride(ride_id));
drop policy if exists stops_update on public.ride_stops;
create policy stops_update on public.ride_stops for update to authenticated
  using (public.can_manage_ride(ride_id)) with check (public.can_manage_ride(ride_id));
drop policy if exists stops_delete on public.ride_stops;
create policy stops_delete on public.ride_stops for delete to authenticated
  using (public.can_manage_ride(ride_id));

-- المشاركة (الكتابة عبر set_rsvp / set_progress)
drop policy if exists participants_read on public.ride_participants;
create policy participants_read on public.ride_participants for select to authenticated
  using ((select public.is_active_member()));
drop policy if exists participants_delete on public.ride_participants;
create policy participants_delete on public.ride_participants for delete to authenticated
  using ((select public.is_active_member())
         and (user_id = (select auth.uid()) or public.can_manage_ride(ride_id)));

-- التصويت (الكتابة عبر create_poll / cast_vote)
drop policy if exists polls_read on public.polls;
create policy polls_read on public.polls for select to authenticated
  using ((select public.is_active_member()));
drop policy if exists polls_delete on public.polls;
create policy polls_delete on public.polls for delete to authenticated
  using ((select public.is_active_member()) and (created_by = (select auth.uid()) or (select public.is_admin())));
drop policy if exists poll_options_read on public.poll_options;
create policy poll_options_read on public.poll_options for select to authenticated
  using ((select public.is_active_member()));
drop policy if exists poll_votes_read on public.poll_votes;
create policy poll_votes_read on public.poll_votes for select to authenticated
  using ((select public.is_active_member()));

-- الرسائل
drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages for select to authenticated
  using ((select public.is_active_member()));
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check ((select public.is_active_member()) and user_id = (select auth.uid()));
drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages for delete to authenticated
  using ((select public.is_active_member()) and (user_id = (select auth.uid()) or (select public.is_admin())));

-- المواقع: تظهر فقط أثناء مدة المشاركة
drop policy if exists locations_read on public.member_locations;
create policy locations_read on public.member_locations for select to authenticated
  using (user_id = (select auth.uid())
         or ((select public.is_active_member()) and share_until > now()));
drop policy if exists locations_delete on public.member_locations;
create policy locations_delete on public.member_locations for delete to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- طلبات المساعدة
drop policy if exists help_read on public.help_requests;
create policy help_read on public.help_requests for select to authenticated
  using ((select public.is_active_member()));
drop policy if exists help_insert on public.help_requests;
create policy help_insert on public.help_requests for insert to authenticated
  with check ((select public.is_active_member()) and user_id = (select auth.uid()));
drop policy if exists help_delete on public.help_requests;
create policy help_delete on public.help_requests for delete to authenticated
  using ((select public.is_active_member()) and (user_id = (select auth.uid()) or (select public.is_admin())));

drop policy if exists responders_read on public.help_responders;
create policy responders_read on public.help_responders for select to authenticated
  using ((select public.is_active_member()));
drop policy if exists responders_insert on public.help_responders;
create policy responders_insert on public.help_responders for insert to authenticated
  with check ((select public.is_active_member()) and user_id = (select auth.uid())
              and exists (select 1 from public.help_requests h where h.id = request_id and h.status = 'open'));
drop policy if exists responders_delete on public.help_responders;
create policy responders_delete on public.help_responders for delete to authenticated
  using (user_id = (select auth.uid()));

-- ألبوم الطلعة
drop policy if exists media_read on public.ride_media;
create policy media_read on public.ride_media for select to authenticated
  using ((select public.is_active_member()));
drop policy if exists media_insert on public.ride_media;
create policy media_insert on public.ride_media for insert to authenticated
  with check ((select public.is_active_member()) and user_id = (select auth.uid()));
drop policy if exists media_delete on public.ride_media;
create policy media_delete on public.ride_media for delete to authenticated
  using ((select public.is_active_member()) and (user_id = (select auth.uid()) or (select public.is_admin())));

-- ---------------------------------------------------------------------
-- 7) التخزين: حاوية خاصة، وكل عضو يرفع داخل مجلده فقط
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('nightriders', 'nightriders', false, 52428800,
        array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists nr_storage_read on storage.objects;
create policy nr_storage_read on storage.objects for select to authenticated
  using (bucket_id = 'nightriders' and (select public.is_active_member()));
drop policy if exists nr_storage_insert on storage.objects;
create policy nr_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'nightriders' and (select public.is_active_member())
              and (storage.foldername(name))[1] = (select auth.uid()::text));
drop policy if exists nr_storage_delete on storage.objects;
create policy nr_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'nightriders'
         and (((select public.is_active_member()) and (storage.foldername(name))[1] = (select auth.uid()::text))
              or (select public.is_admin())));

-- ---------------------------------------------------------------------
-- 8) التحديث المباشر (Realtime) — يخضع لسياسات RLS نفسها لكل مشترك
-- ---------------------------------------------------------------------

do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['profiles','announcements','rides','ride_stops','ride_participants','polls',
                           'poll_options','poll_votes','messages','member_locations','help_requests',
                           'help_responders','ride_media']
  loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 9) اختياري: تنظيف المواقع المنتهية كل 5 دقائق (فعّل pg_cron من Database > Extensions)
--    السياسات تخفي المواقع المنتهية فورًا حتى بدون هذا الجدول الزمني.
-- ---------------------------------------------------------------------
-- select cron.schedule('nightriders-purge-locations', '*/5 * * * *', 'select public.purge_expired_locations()');

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

-- ---------------------------------------------------------------------
-- 12) إشعارات الجوال (Web Push): طلعة جديدة، طلب مساعدة، رسالة في الشات
--     الجوال يسجّل اشتراكه، وعند الإضافة في الجداول يستدعي Trigger دالة الحافة notify
--     عبر pg_net (بدون تعطيل العملية). المفاتيح السرية في مخطط private غير مكشوف للواجهة.
--     بعد التشغيل: أضف القيم في private.app_secrets (انظر README).
-- ---------------------------------------------------------------------

create extension if not exists pg_net with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.app_secrets (key text primary key, value text not null);
revoke all on private.app_secrets from public, anon, authenticated;

create table if not exists public.push_subscriptions (
  endpoint   text primary key check (endpoint like 'https://%' and char_length(endpoint) < 1000),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  p256dh     text not null check (char_length(p256dh) < 200),
  auth       text not null check (char_length(auth) < 100),
  created_at timestamptz not null default now()
);
create index if not exists push_subs_user_idx on public.push_subscriptions (user_id);

create table if not exists public.notification_prefs (
  user_id uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  rides   boolean not null default true,
  help    boolean not null default true,
  chat    boolean not null default true,
  updated_at timestamptz not null default now()
);

revoke all on public.push_subscriptions, public.notification_prefs from anon, authenticated;
grant select on public.push_subscriptions to authenticated;
grant select, insert (user_id, rides, help, chat), update (rides, help, chat) on public.notification_prefs to authenticated;
alter table public.push_subscriptions enable row level security;
alter table public.notification_prefs enable row level security;
drop policy if exists push_subs_own on public.push_subscriptions;
create policy push_subs_own on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists prefs_own_read on public.notification_prefs;
create policy prefs_own_read on public.notification_prefs for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists prefs_own_ins on public.notification_prefs;
create policy prefs_own_ins on public.notification_prefs for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_active_member()));
drop policy if exists prefs_own_upd on public.notification_prefs;
create policy prefs_own_upd on public.notification_prefs for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- تسجيل اشتراك هذا الجهاز (لو الجهاز كان مسجّل لحساب ثاني ينتقل للحساب الحالي)
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_member() then raise exception 'members_only' using errcode = '42501'; end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth) values (p_endpoint, auth.uid(), p_p256dh, p_auth);
end $$;
create or replace function public.remove_push_subscription(p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

-- للدالة الخلفية فقط (service_role): الإعدادات السرية + قائمة المستلمين
create or replace function public.get_push_config() returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_object_agg(key, value) from private.app_secrets where key in ('vapid', 'notify_secret', 'contact');
$$;
create or replace function public.push_targets(p_kind text, p_ride uuid, p_exclude uuid)
returns table (endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = '' as $$
  select s.endpoint, s.p256dh, s.auth
  from public.push_subscriptions s
  join public.profiles p on p.id = s.user_id and p.status = 'active'
  left join public.notification_prefs n on n.user_id = s.user_id
  where s.user_id is distinct from p_exclude
    and case p_kind
          when 'ride' then coalesce(n.rides, true)
          when 'help' then coalesce(n.help, true)
          when 'chat' then coalesce(n.chat, true) and (
               p_ride is null
               or exists (select 1 from public.ride_participants rp where rp.ride_id = p_ride and rp.user_id = s.user_id and rp.rsvp in ('going','maybe'))
               or exists (select 1 from public.rides r where r.id = p_ride and r.organizer_id = s.user_id))
          else false end;
$$;
create or replace function public.drop_push_subscriptions(p_endpoints text[]) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions where endpoint = any(p_endpoints);
$$;

revoke execute on function public.save_push_subscription(text, text, text), public.remove_push_subscription(text),
  public.get_push_config(), public.push_targets(text, uuid, uuid), public.drop_push_subscriptions(text[]) from public, anon, authenticated;
grant execute on function public.save_push_subscription(text, text, text), public.remove_push_subscription(text) to authenticated;
grant execute on function public.get_push_config(), public.push_targets(text, uuid, uuid), public.drop_push_subscriptions(text[]) to service_role;

-- Trigger: يرسل الحدث للدالة الخلفية بدون انتظار، ولا يعطّل الإضافة أبدًا
create or replace function public.notify_push() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text;
begin
  select value into v_url from private.app_secrets where key = 'notify_url';
  select value into v_secret from private.app_secrets where key = 'notify_secret';
  if v_url is null or v_secret is null then return new; end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('table', tg_table_name, 'record', to_jsonb(new)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-nr-secret', v_secret),
    timeout_milliseconds := 8000);
  return new;
exception when others then
  return new;
end $$;
revoke execute on function public.notify_push() from public, anon, authenticated;

drop trigger if exists rides_notify on public.rides;
create trigger rides_notify after insert on public.rides for each row execute function public.notify_push();
drop trigger if exists help_notify on public.help_requests;
create trigger help_notify after insert on public.help_requests for each row execute function public.notify_push();
drop trigger if exists messages_notify on public.messages;
create trigger messages_notify after insert on public.messages for each row execute function public.notify_push();

-- ---------------------------------------------------------------------
-- 13) أسلوب الطلعة (اختياري) — نفس قيم أسلوب الركوب في الملف الشخصي
-- ---------------------------------------------------------------------
alter table public.rides add column if not exists ride_style text
  check (ride_style in ('calm','touring','long_distance','sport','offroad'));
grant insert (ride_style), update (ride_style) on public.rides to authenticated;

-- ---------------------------------------------------------------------
-- 14) الشات: الرد على رسالة معيّنة + الرسائل الصوتية
-- ---------------------------------------------------------------------
alter table public.messages add column if not exists reply_to uuid references public.messages(id) on delete set null;
alter table public.messages add column if not exists audio_path text;
alter table public.messages add column if not exists audio_ms integer check (audio_ms is null or audio_ms between 300 and 300000);
alter table public.messages drop constraint if exists messages_check;
alter table public.messages add constraint messages_check
  check (char_length(btrim(coalesce(body, ''))) > 0 or image_path is not null or audio_path is not null);
alter table public.messages drop constraint if exists messages_audio_path_check;
alter table public.messages add constraint messages_audio_path_check
  check (audio_path is null or audio_path like user_id::text || '/chat/%');
grant insert (reply_to, audio_path, audio_ms) on public.messages to authenticated;

-- الرد لازم يكون على رسالة في نفس القناة (العام أو نفس الطلعة)
create or replace function public.messages_reply_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.reply_to is not null and not exists (
       select 1 from public.messages m where m.id = new.reply_to and m.ride_id is not distinct from new.ride_id) then
    raise exception 'reply_other_channel' using errcode = '22023';
  end if;
  return new;
end $$;
revoke execute on function public.messages_reply_guard() from public, anon, authenticated;
drop trigger if exists messages_reply_guard on public.messages;
create trigger messages_reply_guard before insert on public.messages for each row execute function public.messages_reply_guard();

-- السماح بملفات الصوت في حاوية التخزين
update storage.buckets
  set allowed_mime_types = array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm',
                                 'audio/mp4','audio/webm','audio/mpeg','audio/aac','audio/ogg']
  where id = 'nightriders';

-- ---------------------------------------------------------------------
-- 15) إشعار «جاهز أطلع»: لما عضو يفعّلها (وكان غير مفعّل) — مع كل تفعيل جديد (التمديد ما يرسل)
-- ---------------------------------------------------------------------
alter table public.notification_prefs add column if not exists ready boolean not null default true;
grant insert (ready), update (ready) on public.notification_prefs to authenticated;

create table if not exists private.ready_notify_log (user_id uuid primary key, at timestamptz not null);
revoke all on private.ready_notify_log from public, anon, authenticated;

create or replace function public.push_targets(p_kind text, p_ride uuid, p_exclude uuid)
returns table (endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = '' as $$
  select s.endpoint, s.p256dh, s.auth
  from public.push_subscriptions s
  join public.profiles p on p.id = s.user_id and p.status = 'active'
  left join public.notification_prefs n on n.user_id = s.user_id
  where s.user_id is distinct from p_exclude
    and case p_kind
          when 'ride'  then coalesce(n.rides, true)
          when 'help'  then coalesce(n.help, true)
          when 'ready' then coalesce(n.ready, true)
          when 'chat'  then coalesce(n.chat, true) and (
               p_ride is null
               or exists (select 1 from public.ride_participants rp where rp.ride_id = p_ride and rp.user_id = s.user_id and rp.rsvp in ('going','maybe'))
               or exists (select 1 from public.rides r where r.id = p_ride and r.organizer_id = s.user_id))
          else false end;
$$;
revoke execute on function public.push_targets(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.push_targets(text, uuid, uuid) to service_role;

create or replace function public.ready_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text;
begin
  if new.status <> 'active' or new.ready_until is null or new.ready_until <= now()
     or (old.ready_until is not null and old.ready_until > now()) then
    return new;                                   -- مو تفعيل جديد (تمديد أو إيقاف)
  end if;
  insert into private.ready_notify_log (user_id, at) values (new.id, now())
    on conflict (user_id) do update set at = excluded.at;
  select value into v_url from private.app_secrets where key = 'notify_url';
  select value into v_secret from private.app_secrets where key = 'notify_secret';
  if v_url is null or v_secret is null then return new; end if;
  perform net.http_post(url := v_url,
    body := jsonb_build_object('table', 'ready', 'record', jsonb_build_object('id', new.id, 'ready_until', new.ready_until)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-nr-secret', v_secret),
    timeout_milliseconds := 8000);
  return new;
exception when others then
  return new;
end $$;
revoke execute on function public.ready_notify() from public, anon, authenticated;
drop trigger if exists profiles_ready_notify on public.profiles;
create trigger profiles_ready_notify after update of ready_until on public.profiles
  for each row execute function public.ready_notify();

-- ===================== 16) الانضمام بموافقة الأدمن + إشعاراته =====================
-- طلب الانضمام بدون دعوة يصير «بانتظار الموافقة»
create or replace function public.request_join(p_display_name text, p_bike_type text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_status text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select status into v_status from public.profiles where id = v_uid;
  if v_status is not null then
    if v_status = 'suspended' then raise exception 'account_suspended' using errcode = '42501'; end if;
    return v_status;
  end if;
  insert into public.profiles (id, display_name, bike_type, status)
  values (v_uid, btrim(p_display_name), nullif(btrim(coalesce(p_bike_type, '')), ''), 'pending');
  return 'pending';
end $$;

-- صاحب الطلب يقدر يفعّل الإشعارات وهو بالانتظار (عشان يوصله إشعار القبول)
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(public.my_status(), '') not in ('active','pending') then raise exception 'members_only' using errcode = '42501'; end if;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth) values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

-- أجهزة عضو واحد (لإشعار القبول) — للخادم فقط
create or replace function public.push_targets_user(p_user uuid)
returns table (endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = '' as $$
  select s.endpoint, s.p256dh, s.auth from public.push_subscriptions s
  join public.profiles p on p.id = s.user_id and p.status = 'active'
  where s.user_id = p_user;
$$;
revoke execute on function public.push_targets_user(uuid) from public, anon, authenticated;
grant execute on function public.push_targets_user(uuid) to service_role;

-- push_targets: نوع جديد 'join' للأدمنية فقط
create or replace function public.push_targets(p_kind text, p_ride uuid, p_exclude uuid)
returns table (endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = '' as $$
  select s.endpoint, s.p256dh, s.auth
  from public.push_subscriptions s
  join public.profiles p on p.id = s.user_id and p.status = 'active'
  left join public.notification_prefs n on n.user_id = s.user_id
  where s.user_id is distinct from p_exclude
    and case p_kind
          when 'join'  then p.role in ('admin','owner')
          when 'ride'  then coalesce(n.rides, true)
          when 'help'  then coalesce(n.help, true)
          when 'ready' then coalesce(n.ready, true)
          when 'chat'  then coalesce(n.chat, true) and (
               p_ride is null
               or exists (select 1 from public.ride_participants rp where rp.ride_id = p_ride and rp.user_id = s.user_id and rp.rsvp in ('going','maybe'))
               or exists (select 1 from public.rides r where r.id = p_ride and r.organizer_id = s.user_id))
          else false end;
$$;

-- Trigger: طلب جديد → إشعار للأدمن، قبول → إشعار لصاحب الطلب
create or replace function public.member_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text; v_table text;
begin
  if tg_op = 'INSERT' and new.status = 'pending' then v_table := 'join';
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'active' then v_table := 'approved';
  else return new; end if;
  select value into v_url from private.app_secrets where key = 'notify_url';
  select value into v_secret from private.app_secrets where key = 'notify_secret';
  if v_url is null or v_secret is null then return new; end if;
  perform net.http_post(url := v_url,
    body := jsonb_build_object('table', v_table, 'record', jsonb_build_object('id', new.id, 'display_name', new.display_name, 'bike_type', new.bike_type)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-nr-secret', v_secret),
    timeout_milliseconds := 8000);
  return new;
exception when others then
  return new;
end $$;
revoke execute on function public.member_notify() from public, anon, authenticated;

drop trigger if exists profiles_member_notify on public.profiles;
create trigger profiles_member_notify after insert or update of status on public.profiles
  for each row execute function public.member_notify();

-- ===================== 17) تذكير قبل الطلعة بساعة =====================
create extension if not exists pg_cron;

create table if not exists private.ride_reminders (
  ride_id uuid not null,
  meet_at timestamptz not null,          -- لو تغيّر وقت الطلعة يطلع تذكير جديد للوقت الجديد
  sent_at timestamptz not null default now(),
  primary key (ride_id, meet_at)
);

-- push_targets: نوع 'reminder' = اللي ضاغطين «مشارك» + المنظم
create or replace function public.push_targets(p_kind text, p_ride uuid, p_exclude uuid)
returns table (endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = '' as $$
  select s.endpoint, s.p256dh, s.auth
  from public.push_subscriptions s
  join public.profiles p on p.id = s.user_id and p.status = 'active'
  left join public.notification_prefs n on n.user_id = s.user_id
  where s.user_id is distinct from p_exclude
    and case p_kind
          when 'join'  then p.role in ('admin','owner')
          when 'ride'  then coalesce(n.rides, true)
          when 'help'  then coalesce(n.help, true)
          when 'ready' then coalesce(n.ready, true)
          when 'reminder' then coalesce(n.rides, true) and (
               exists (select 1 from public.ride_participants rp where rp.ride_id = p_ride and rp.user_id = s.user_id and rp.rsvp = 'going')
               or exists (select 1 from public.rides r where r.id = p_ride and r.organizer_id = s.user_id))
          when 'chat'  then coalesce(n.chat, true) and (
               p_ride is null
               or exists (select 1 from public.ride_participants rp where rp.ride_id = p_ride and rp.user_id = s.user_id and rp.rsvp in ('going','maybe'))
               or exists (select 1 from public.rides r where r.id = p_ride and r.organizer_id = s.user_id))
          else false end;
$$;

-- كل 5 دقائق: الطلعات اللي تبدأ خلال ساعة ولم يُرسل لها تذكير
create or replace function private.send_ride_reminders() returns int
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text; r record; n int := 0;
begin
  select value into v_url from private.app_secrets where key = 'notify_url';
  select value into v_secret from private.app_secrets where key = 'notify_secret';
  if v_url is null or v_secret is null then return 0; end if;
  for r in
    select x.id, x.title, x.meet_at, x.meet_name from public.rides x
    where x.status = 'planned'
      and x.meet_at > now() + interval '10 minutes' and x.meet_at <= now() + interval '60 minutes'
      and x.created_at < x.meet_at - interval '70 minutes'          -- طلعة انضافت قبل أقل من ساعة: إشعارها الأول يكفي
      and not exists (select 1 from private.ride_reminders m where m.ride_id = x.id and m.meet_at = x.meet_at)
  loop
    insert into private.ride_reminders (ride_id, meet_at) values (r.id, r.meet_at) on conflict do nothing;
    perform net.http_post(url := v_url,
      body := jsonb_build_object('table', 'reminder', 'record', jsonb_build_object('id', r.id, 'title', r.title, 'meet_at', r.meet_at, 'meet_name', r.meet_name)),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-nr-secret', v_secret),
      timeout_milliseconds := 8000);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function private.send_ride_reminders() from public, anon, authenticated;

select cron.schedule('ride-reminders', '*/5 * * * *', 'select private.send_ride_reminders()');

-- ===================== 18) غرفة المحادثة الصوتية =====================
-- الإشارات (WebRTC signaling) تمر عبر قناة Realtime خاصة اسمها voice-room — للأعضاء النشطين فقط
create policy "voice_room_read" on realtime.messages for select to authenticated
  using (realtime.topic() = 'voice-room' and extension in ('broadcast','presence') and (select public.is_active_member()));
create policy "voice_room_write" on realtime.messages for insert to authenticated
  with check (realtime.topic() = 'voice-room' and extension in ('broadcast','presence') and (select public.is_active_member()));

alter table public.notification_prefs add column if not exists voice boolean not null default true;

create table if not exists private.voice_notify_log (user_id uuid primary key, at timestamptz not null);

-- push_targets: نوع 'voice'
create or replace function public.push_targets(p_kind text, p_ride uuid, p_exclude uuid)
returns table (endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = '' as $$
  select s.endpoint, s.p256dh, s.auth
  from public.push_subscriptions s
  join public.profiles p on p.id = s.user_id and p.status = 'active'
  left join public.notification_prefs n on n.user_id = s.user_id
  where s.user_id is distinct from p_exclude
    and case p_kind
          when 'join'  then p.role in ('admin','owner')
          when 'ride'  then coalesce(n.rides, true)
          when 'help'  then coalesce(n.help, true)
          when 'ready' then coalesce(n.ready, true)
          when 'voice' then coalesce(n.voice, true)
          when 'reminder' then coalesce(n.rides, true) and (
               exists (select 1 from public.ride_participants rp where rp.ride_id = p_ride and rp.user_id = s.user_id and rp.rsvp = 'going')
               or exists (select 1 from public.rides r where r.id = p_ride and r.organizer_id = s.user_id))
          when 'chat'  then coalesce(n.chat, true) and (
               p_ride is null
               or exists (select 1 from public.ride_participants rp where rp.ride_id = p_ride and rp.user_id = s.user_id and rp.rsvp in ('going','maybe'))
               or exists (select 1 from public.rides r where r.id = p_ride and r.organizer_id = s.user_id))
          else false end;
$$;

-- يستدعيها التطبيق لما أحد يفتح الغرفة وهي فاضية → إشعار للكل (مرة كل 5 دقائق لنفس الشخص كحد أقصى)
create or replace function public.voice_room_opened() returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_url text; v_secret text; v_last timestamptz;
begin
  if not public.is_active_member() then raise exception 'members_only' using errcode = '42501'; end if;
  select at into v_last from private.voice_notify_log where user_id = v_uid;
  if v_last is not null and v_last > now() - interval '5 minutes' then return false; end if;
  insert into private.voice_notify_log (user_id, at) values (v_uid, now())
    on conflict (user_id) do update set at = excluded.at;
  select value into v_url from private.app_secrets where key = 'notify_url';
  select value into v_secret from private.app_secrets where key = 'notify_secret';
  if v_url is null or v_secret is null then return false; end if;
  perform net.http_post(url := v_url,
    body := jsonb_build_object('table', 'voice', 'record', jsonb_build_object('id', v_uid)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-nr-secret', v_secret),
    timeout_milliseconds := 8000);
  return true;
end $$;
revoke execute on function public.voice_room_opened() from public, anon;
grant execute on function public.voice_room_opened() to authenticated;
grant insert (voice), update (voice) on public.notification_prefs to authenticated;
