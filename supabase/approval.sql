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
