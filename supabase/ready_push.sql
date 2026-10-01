
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
