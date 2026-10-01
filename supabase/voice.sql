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
