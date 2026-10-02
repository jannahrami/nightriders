-- ===================== 19) عدّاد زيارات روابط العرض التجريبي =====================
-- يسجّل: اسم العرض، الصفحة، الوقت، ومعرّف عشوائي للمتصفح (بدون اسم أو رقم أو IP)
create table if not exists private.demo_visits (
  id bigint generated always as identity primary key,
  demo text not null,
  page text not null,
  visitor text,
  at timestamptz not null default now()
);
create index if not exists demo_visits_demo_at on private.demo_visits (demo, at desc);

-- يستدعيها رابط العرض (بدون تسجيل دخول). محمية بفحص الصيغة وحد أعلى للتسجيل.
create or replace function public.demo_ping(p_demo text, p_page text, p_visitor text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_demo !~ '^[a-z0-9-]{1,40}$' or p_page !~ '^[a-z0-9/_-]{0,40}$' then return; end if;
  if p_visitor is not null and p_visitor !~ '^[a-z0-9-]{6,40}$' then p_visitor := null; end if;
  if (select count(*) from private.demo_visits where at > now() - interval '1 hour') >= 400 then return; end if;
  insert into private.demo_visits (demo, page, visitor) values (p_demo, coalesce(nullif(p_page, ''), 'home'), p_visitor);
end $$;
revoke execute on function public.demo_ping(text, text, text) from public;
grant execute on function public.demo_ping(text, text, text) to anon, authenticated;

-- ملخص للأدمن الأساسي فقط
create or replace function public.demo_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'owner_only' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(x order by x->>'last_at' desc) from (
      select jsonb_build_object(
        'demo', v.demo,
        'opens', count(*) filter (where v.page = 'open'),
        'devices', count(distinct v.visitor),
        'first_at', min(v.at), 'last_at', max(v.at),
        'pages', (select coalesce(jsonb_agg(jsonb_build_object('page', p.page, 'n', p.n) order by p.n desc), '[]'::jsonb)
                  from (select page, count(*) n from private.demo_visits d where d.demo = v.demo and d.page <> 'open' group by page) p)
      ) x
      from private.demo_visits v group by v.demo
    ) s), '[]'::jsonb);
end $$;
revoke execute on function public.demo_stats() from public, anon;
grant execute on function public.demo_stats() to authenticated;
