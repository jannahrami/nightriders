
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
