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
