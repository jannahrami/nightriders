-- اختبارات الصلاحيات (RLS + GRANT + RPC) — تُشغَّل بعد supabase_mock.sql و schema.sql
-- كل اختبار يُسجّل في tst.results ثم يُطبع ملخص في النهاية.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create schema tst;
create table tst.results (n serial, section text, name text, ok boolean, detail text);
grant usage on schema tst to anon, authenticated;
grant insert, select on tst.results to anon, authenticated;
grant usage on sequence tst.results_n_seq to anon, authenticated;
create table tst.ids (k text primary key, v uuid);
grant select, insert, update on tst.ids to anon, authenticated;
create table tst.section (s text);
insert into tst.section values ('');
grant select, update on tst.section to anon, authenticated;

create function tst.id(k text) returns uuid language sql stable as $$ select v from tst.ids where ids.k = $1 $$;
create function tst.put(k text, v uuid) returns void language sql as $$
  insert into tst.ids values ($1, $2) on conflict (k) do update set v = excluded.v $$;
grant execute on all functions in schema tst to anon, authenticated;

create function tst.sec(s text) returns void language sql as $$ update tst.section set s = $1 $$;

create function tst.as_user(k text) returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', false);
  if k = 'anon' then
    perform set_config('request.jwt.claims', '{"role":"anon"}', false);
    perform set_config('role', 'anon', false);
  elsif k = 'postgres' then
    perform set_config('request.jwt.claims', '', false);
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', tst.id(k), 'role', 'authenticated')::text, false);
    perform set_config('role', 'authenticated', false);
  end if;
end $$;

create function tst.rec(name text, ok boolean, detail text) returns void language sql as $$
  insert into tst.results (section, name, ok, detail) select s, $1, $2, $3 from tst.section $$;

-- يتوقع عددًا محددًا من الصفوف من استعلام
create function tst.count_is(name text, q text, expected bigint) returns void language plpgsql as $$
declare c bigint;
begin
  execute format('select count(*) from (%s) _q', q) into c;
  perform tst.rec(name, c = expected, format('expected %s, got %s', expected, c));
exception when others then
  perform tst.rec(name, false, 'error: ' || sqlerrm);
end $$;

-- يتوقع نجاح الأمر ويعيد عدد الصفوف المتأثرة (إن طُلب)
create function tst.ok(name text, q text, expected_rows int default null) returns void language plpgsql as $$
declare c int;
begin
  execute q;
  get diagnostics c = row_count;
  if expected_rows is null or c = expected_rows then
    perform tst.rec(name, true, format('rows=%s', c));
  else
    perform tst.rec(name, false, format('expected %s rows, got %s', expected_rows, c));
  end if;
exception when others then
  perform tst.rec(name, false, 'error: ' || sqlerrm);
end $$;

-- يتوقع رفض الأمر بخطأ يطابق النمط
create function tst.fails(name text, q text, pattern text) returns void language plpgsql as $$
begin
  execute q;
  perform tst.rec(name, false, 'command succeeded but should have failed');
exception when others then
  perform tst.rec(name, sqlerrm ~* pattern, 'error: ' || sqlerrm);
end $$;

grant execute on all functions in schema tst to anon, authenticated;

-- ---------------------------------------------------------------------
-- المستخدمون: owner (أنت)، admin2، m1، m2، pending (غير مقبول)، outsider (بلا دعوة)
-- ---------------------------------------------------------------------
insert into auth.users (email) values
  ('owner@test.local'), ('admin2@test.local'), ('m1@test.local'), ('m2@test.local'),
  ('pending@test.local'), ('outsider@test.local'), ('late@test.local');
select tst.put(split_part(email, '@', 1), id) from auth.users;

-- =====================================================================
select tst.sec('1. إعداد الأدمن الأساسي');
select tst.as_user('m1');
select tst.fails('عضو مسجّل لا يستطيع تنفيذ bootstrap_owner',
  $$select public.bootstrap_owner('m1@test.local','M1')$$, 'permission denied');
select tst.as_user('anon');
select tst.fails('الزائر (anon) لا يستطيع تنفيذ bootstrap_owner',
  $$select public.bootstrap_owner('m1@test.local','M1')$$, 'permission denied');
select tst.as_user('postgres');
select tst.ok('SQL Editor يعيّن الأدمن الأساسي', $$select public.bootstrap_owner('owner@test.local','رامي')$$);
select tst.fails('لا يمكن تعيين أدمن أساسي ثانٍ',
  $$select public.bootstrap_owner('admin2@test.local','X')$$, 'owner_exists');

-- =====================================================================
select tst.sec('2. الدعوات');
select tst.as_user('owner');
do $$ declare r public.invites;
begin
  r := public.create_invite(72, 1, 'admin2');  perform tst.put('inv_admin2', r.id);
  r := public.create_invite(72, 1, 'm1');      perform tst.put('inv_m1', r.id);
  r := public.create_invite(72, 1, 'm2');      perform tst.put('inv_m2', r.id);
  r := public.create_invite(72, 5, 'pending'); perform tst.put('inv_multi', r.id);
  r := public.create_invite(72, 1, 'revoked'); perform tst.put('inv_revoked', r.id);
end $$;
select tst.count_is('الأدمن يرى الدعوات', 'select * from public.invites', 5);
select tst.ok('الأدمن يلغي دعوة', $$select public.revoke_invite(tst.id('inv_revoked'))$$);

select tst.as_user('outsider');
select tst.count_is('مستخدم بلا عضوية لا يرى الدعوات', 'select * from public.invites', 0);
select tst.fails('مستخدم بلا عضوية لا ينشئ دعوة', $$select public.create_invite(24,1,null)$$, 'admin_only');
select tst.fails('لا يمكن تعديل جدول الدعوات مباشرة',
  $$update public.invites set max_uses = 50$$, 'permission denied');

select tst.as_user('anon');
select tst.ok('check_invite متاح قبل التسجيل', $$select public.check_invite('ZZZZZZZZZZ')$$);
select tst.count_is('check_invite: كود غير صحيح = false',
  $$select 1 where public.check_invite('ZZZZZZZZZZ') = false$$, 1);
select tst.fails('anon لا يستطيع redeem_invite', $$select public.redeem_invite('ZZZZZZZZZZ','x')$$, 'permission denied');
select tst.fails('anon ممنوع من جدول الملفات الشخصية', 'select * from public.profiles', 'permission denied');
select tst.fails('anon ممنوع من جدول الطلعات', 'select * from public.rides', 'permission denied');

select tst.as_user('postgres');
-- الأكواد تُقرأ هنا فقط لتمريرها للمستخدمين في الاختبار
create table tst.codes as select tst_k.k, i.code from tst.ids tst_k join public.invites i on i.id = tst_k.v;
grant select on tst.codes to authenticated;

select tst.as_user('outsider');
select tst.fails('كود خاطئ يُرفض', $$select public.redeem_invite('ABCDEFGHJK','دخيل')$$, 'invalid_invite');
select tst.fails('كود ملغى يُرفض',
  $$select public.redeem_invite((select code from tst.codes where k='inv_revoked'),'دخيل')$$, 'invalid_invite');

select tst.as_user('m1');
select tst.ok('m1 يستخدم دعوته → بانتظار الموافقة',
  $$select public.redeem_invite(lower((select code from tst.codes where k='inv_m1')),'محمد')$$);
select tst.count_is('حالة m1 pending', $$select * from public.profiles where id = auth.uid() and status='pending'$$, 1);
select tst.as_user('outsider');
select tst.fails('دعوة استخدام واحد لا تُستخدم مرتين',
  $$select public.redeem_invite((select code from tst.codes where k='inv_m1'),'دخيل')$$, 'invalid_invite');

select tst.as_user('m2');      select public.redeem_invite((select code from tst.codes where k='inv_m2'), 'سعد');
select tst.as_user('admin2');  select public.redeem_invite((select code from tst.codes where k='inv_admin2'), 'فهد');
select tst.as_user('pending'); select public.redeem_invite((select code from tst.codes where k='inv_multi'), 'منتظر');

select tst.as_user('postgres');
update public.invites set expires_at = now() - interval '1 minute' where id = tst.id('inv_multi');
select tst.as_user('late');
select tst.fails('دعوة منتهية الصلاحية تُرفض',
  $$select public.redeem_invite((select code from tst.codes where k='inv_multi'),'متأخر')$$, 'invalid_invite');

-- =====================================================================
select tst.sec('3. حساب غير مقبول (pending)');
select tst.as_user('pending');
select tst.count_is('يرى ملفه فقط', 'select * from public.profiles', 1);
select tst.fails('لا يغيّر حالته إلى active',
  $$update public.profiles set status='active' where id = auth.uid()$$, 'permission denied');
select tst.fails('لا يرقّي نفسه إلى admin',
  $$update public.profiles set role='admin' where id = auth.uid()$$, 'permission denied');
select tst.fails('لا ينشئ ملفًا شخصيًا مباشرة',
  $$insert into public.profiles (id, display_name, status, role) values (auth.uid(),'x','active','owner')$$, 'permission denied');
select tst.ok('يعدّل اسمه ومدينته', $$update public.profiles set city='الرياض' where id = auth.uid()$$, 1);
select tst.fails('لا يوافق على نفسه', $$select public.approve_member(auth.uid())$$, 'admin_only');

select tst.as_user('owner');
select tst.count_is('الأدمن يرى طلبات الانضمام المعلّقة',
  $$select * from public.profiles where status='pending'$$, 4);
select tst.ok('الأدمن يقبل m1', $$select public.approve_member(tst.id('m1'))$$);
select tst.ok('الأدمن يقبل m2', $$select public.approve_member(tst.id('m2'))$$);
select tst.ok('الأدمن يقبل admin2', $$select public.approve_member(tst.id('admin2'))$$);

-- =====================================================================
select tst.sec('4. الأدوار ومنع الترقية الذاتية');
select tst.as_user('m1');
select tst.fails('العضو لا يرقّي نفسه', $$update public.profiles set role='admin' where id = auth.uid()$$, 'permission denied');
select tst.fails('العضو لا يستدعي set_admin', $$select public.set_admin(auth.uid(), true)$$, 'owner_only');
select tst.fails('العضو لا يوافق على عضو معلّق', $$select public.approve_member(tst.id('pending'))$$, 'admin_only');
select tst.ok('العضو لا يعدّل ملف غيره (0 صفوف)',
  $$update public.profiles set city='x' where id = tst.id('m2')$$, 0);
select tst.count_is('العضو لا يرى الأعضاء المعلّقين',
  $$select * from public.profiles where status='pending'$$, 0);
select tst.count_is('العضو يرى الأعضاء المقبولين (4)', $$select * from public.profiles$$, 4);
select tst.fails('جاهز أطلع لا يتجاوز 12 ساعة',
  $$update public.profiles set ready_until = now() + interval '13 hours' where id = auth.uid()$$, 'ready_too_long');
select tst.ok('تفعيل جاهز أطلع لساعتين',
  $$update public.profiles set ready_until = now() + interval '2 hours' where id = auth.uid()$$, 1);

select tst.as_user('owner');
select tst.ok('الأساسي يعيّن admin2 أدمن', $$select public.set_admin(tst.id('admin2'), true)$$);
select tst.as_user('admin2');
select tst.fails('الأدمن الإضافي لا يعيّن أدمن آخر', $$select public.set_admin(tst.id('m1'), true)$$, 'owner_only');
select tst.fails('الأدمن الإضافي لا يوقف الأساسي', $$select public.suspend_member(tst.id('owner'))$$, 'cannot_suspend_owner');
select tst.ok('الأدمن الإضافي يرى الدعوات', $$select * from public.invites$$);
select tst.fails('لا يمكن تحويل الأساسي لعضو عبر set_admin', $$select public.set_admin(tst.id('owner'), false)$$, 'owner_only');

-- =====================================================================
select tst.sec('5. رقم التواصل');
select tst.as_user('m1');
select tst.ok('m1 يحفظ رقمه مخفيًا',
  $$insert into public.member_contacts (user_id, phone, show_phone) values (auth.uid(), '+966500000001', false)$$, 1);
select tst.fails('m1 لا يحفظ رقمًا باسم غيره',
  $$insert into public.member_contacts (user_id, phone, show_phone) values (tst.id('m2'), '+966500000009', true)$$, 'row-level security');
select tst.as_user('m2');
select tst.count_is('m2 لا يرى رقم m1 المخفي', 'select * from public.member_contacts', 0);
select tst.as_user('owner');
select tst.count_is('حتى الأدمن لا يرى الرقم المخفي', 'select * from public.member_contacts', 0);
select tst.as_user('m1');
select tst.ok('m1 يُظهر رقمه', $$update public.member_contacts set show_phone = true where user_id = auth.uid()$$, 1);
select tst.as_user('m2');
select tst.count_is('m2 يرى الرقم بعد الإظهار', 'select * from public.member_contacts', 1);
select tst.as_user('pending');
select tst.count_is('غير المقبول لا يرى الرقم', 'select * from public.member_contacts', 0);
select tst.as_user('m1');
select tst.ok('حفظ الرقم بطريقة upsert (كما يرسلها التطبيق)',
  $$insert into public.member_contacts (user_id, phone, show_phone) values (auth.uid(), '+966500000011', true)
    on conflict (user_id) do update set user_id = excluded.user_id, phone = excluded.phone, show_phone = excluded.show_phone$$, 1);
select tst.fails('upsert لا يسمح بالكتابة فوق رقم عضو آخر',
  $$insert into public.member_contacts (user_id, phone, show_phone) values (tst.id('m2'), '+966500000099', true)
    on conflict (user_id) do update set phone = excluded.phone$$, 'row-level security');

-- =====================================================================
select tst.sec('6. الطلعات والمشاركة');
select tst.as_user('m1');
select tst.ok('عضو يقترح طلعة',
  $$insert into public.rides (title, meet_at, depart_at, meet_name, meet_lat, meet_lng, dest_name, dest_lat, dest_lng)
    values ('طلعة الثمامة', now() + interval '1 day', now() + interval '1 day 30 minutes', 'محطة الدائري', 24.77, 46.70, 'الثمامة', 25.01, 46.66)$$, 1);
select tst.as_user('postgres');
select tst.put('ride1', (select id from public.rides where title = 'طلعة الثمامة'));
select tst.as_user('m1');
select tst.count_is('المنظّم أُضيف تلقائيًا كمشارك',
  $$select * from public.ride_participants where ride_id = tst.id('ride1') and user_id = auth.uid() and rsvp='going'$$, 1);
select tst.count_is('المنظّم = المنشئ',
  $$select * from public.rides where id = tst.id('ride1') and organizer_id = auth.uid() and status='planned'$$, 1);
select tst.fails('العضو لا يعيّن غيره منظّمًا',
  $$insert into public.rides (title, meet_at, meet_name, organizer_id) values ('xxx', now()+interval '1 day', 'مكان', tst.id('m2'))$$, 'organizer_not_allowed');
select tst.fails('وقت التحرك لا يسبق التجمع',
  $$insert into public.rides (title, meet_at, depart_at, meet_name) values ('xxx', now()+interval '1 day', now(), 'مكان')$$, 'check constraint');
select tst.fails('لا يمكن تزوير created_by',
  $$update public.rides set created_by = tst.id('m2') where id = tst.id('ride1')$$, 'permission denied');
select tst.fails('قائد الطلعة يجب أن يكون مشاركًا',
  $$update public.rides set leader_id = tst.id('m2') where id = tst.id('ride1')$$, 'leader_must_be_participant');

select tst.as_user('m2');
select tst.ok('m2 لا يعدّل طلعة m1 (0 صفوف)', $$update public.rides set title='تعديل' where id = tst.id('ride1')$$, 0);
select tst.ok('m2 لا يحذف طلعة m1 (0 صفوف)', $$delete from public.rides where id = tst.id('ride1')$$, 0);
select tst.ok('m2 يؤكد المشاركة', $$select public.set_rsvp(tst.id('ride1'), 'going')$$);
select tst.fails('m2 لا يضيف مشاركًا باسم غيره',
  $$insert into public.ride_participants (ride_id, user_id, rsvp) values (tst.id('ride1'), tst.id('admin2'), 'going')$$, 'permission denied');
select tst.fails('m2 لا يعدّل حالة غيره مباشرة',
  $$update public.ride_participants set rsvp='declined' where user_id = tst.id('m1')$$, 'permission denied');
select tst.ok('m2: في الطريق', $$select public.set_progress(tst.id('ride1'), 'on_way')$$);
select tst.ok('m2: وصلت التجمع', $$select public.set_progress(tst.id('ride1'), 'arrived')$$);
select tst.count_is('وقت التحديث يُسجَّل من الخادم',
  $$select * from public.ride_participants where user_id = auth.uid() and progress='arrived' and progress_at is not null$$, 1);

select tst.as_user('m1');
select tst.ok('المنظّم يعيّن m2 قائدًا', $$update public.rides set leader_id = tst.id('m2') where id = tst.id('ride1')$$, 1);
select tst.fails('آخر الركب ≠ قائد الطلعة',
  $$update public.rides set sweep_id = tst.id('m2') where id = tst.id('ride1')$$, 'check constraint');
select tst.ok('المنظّم يضيف محطة بنزين',
  $$insert into public.ride_stops (ride_id, kind, name, lat, lng, position) values (tst.id('ride1'), 'fuel', 'محطة ساسكو', 24.9, 46.68, 1)$$, 1);
select tst.as_user('m2');
select tst.fails('غير المنظّم لا يضيف محطة',
  $$insert into public.ride_stops (ride_id, kind, name, lat, lng) values (tst.id('ride1'), 'rest', 'استراحة', 24.9, 46.6)$$, 'row-level security');
select tst.ok('m2 يعتذر', $$select public.set_rsvp(tst.id('ride1'), 'declined')$$);
select tst.count_is('اعتذار القائد يلغي تعيينه ويمسح حالته',
  $$select * from public.rides r join public.ride_participants p on p.ride_id = r.id and p.user_id = tst.id('m2')
    where r.id = tst.id('ride1') and r.leader_id is null and p.progress is null$$, 1);
select tst.fails('المعتذر لا يحدّث حالة الطريق', $$select public.set_progress(tst.id('ride1'), 'on_way')$$, 'not_going');
select tst.ok('m2 يعود مشاركًا', $$select public.set_rsvp(tst.id('ride1'), 'going')$$);

select tst.as_user('pending');
select tst.count_is('غير المقبول: صفر طلعات', $$select * from public.rides$$, 0);
select tst.fails('غير المقبول لا ينشئ طلعة',
  $$insert into public.rides (title, meet_at, meet_name) values ('xxx', now()+interval '1 day', 'مكان')$$, 'row-level security|organizer_not_active');
select tst.fails('غير المقبول لا يؤكد مشاركة', $$select public.set_rsvp(tst.id('ride1'), 'going')$$, 'members_only');

select tst.as_user('admin2');
select tst.ok('الأدمن يعدّل أي طلعة', $$update public.rides set description='من الأدمن' where id = tst.id('ride1')$$, 1);

-- =====================================================================
select tst.sec('7. التصويت');
select tst.as_user('m1');
select tst.ok('المنظّم ينشئ تصويت وجهة',
  $$select tst.put('poll1', public.create_poll(tst.id('ride1'), 'وين نروح؟', 'destination', null,
      '[{"label":"الثمامة"},{"label":"العمارية"}]'::jsonb))$$);
select tst.fails('تصويت بخيار واحد يُرفض',
  $$select public.create_poll(null, 'سؤال؟', 'other', null, '[{"label":"أ"}]'::jsonb)$$, 'poll_needs');
select tst.as_user('m2');
select tst.fails('غير المنظّم لا ينشئ تصويتًا لطلعة غيره',
  $$select public.create_poll(tst.id('ride1'), 'وقت؟', 'time', null, '[{"label":"9"},{"label":"10"}]'::jsonb)$$, 'ride_managers_only');
select tst.ok('m2 يصوّت',
  $$select public.cast_vote(tst.id('poll1'), (select id from public.poll_options where poll_id = tst.id('poll1') and position=0))$$);
select tst.ok('m2 يغيّر صوته',
  $$select public.cast_vote(tst.id('poll1'), (select id from public.poll_options where poll_id = tst.id('poll1') and position=1))$$);
select tst.count_is('صوت واحد فقط لـ m2', $$select * from public.poll_votes where poll_id = tst.id('poll1') and user_id = auth.uid()$$, 1);
select tst.fails('لا يمكن الإدراج المباشر في الأصوات (تجاوز القاعدة)',
  $$insert into public.poll_votes (poll_id, option_id, user_id) values (tst.id('poll1'), (select id from public.poll_options where poll_id=tst.id('poll1') limit 1), tst.id('m1'))$$, 'permission denied');
select tst.as_user('m1');
select tst.ok('m1 يصوّت', $$select public.cast_vote(tst.id('poll1'), (select id from public.poll_options where poll_id = tst.id('poll1') and position=1))$$);
select tst.ok('تصويت عام من عضو',
  $$select tst.put('poll2', public.create_poll(null, 'أفضل وقت؟', 'time', null, '[{"label":"الخميس"},{"label":"الجمعة"}]'::jsonb))$$);
select tst.fails('لا يُقبل خيار من تصويت آخر',
  $$select public.cast_vote(tst.id('poll1'), (select id from public.poll_options where poll_id = tst.id('poll2') limit 1))$$, 'foreign key');
select tst.count_is('نتيجة التصويت: خياران = 2 صوت على الخيار الثاني',
  $$select * from public.poll_votes v join public.poll_options o on o.id = v.option_id where v.poll_id = tst.id('poll1') and o.position = 1$$, 2);
select tst.as_user('m2');
select tst.fails('غير المنشئ لا يغلق التصويت', $$select public.close_poll(tst.id('poll1'))$$, 'not_allowed');
select tst.as_user('m1');
select tst.ok('المنشئ يغلق التصويت', $$select public.close_poll(tst.id('poll1'))$$);
select tst.as_user('m2');
select tst.fails('لا تصويت بعد الإغلاق',
  $$select public.cast_vote(tst.id('poll1'), (select id from public.poll_options where poll_id = tst.id('poll1') and position=0))$$, 'poll_closed');
select tst.as_user('pending');
select tst.fails('غير المقبول لا يصوّت',
  $$select public.cast_vote(tst.id('poll2'), (select id from public.poll_options where poll_id = tst.id('poll2') limit 1))$$, 'members_only');
select tst.count_is('غير المقبول لا يرى التصويتات', 'select * from public.polls', 0);

-- =====================================================================
select tst.sec('8. الشات');
select tst.as_user('m1');
select tst.ok('m1 يرسل في الشات العام',
  $$insert into public.messages (client_id, body) values ('11111111-1111-1111-1111-111111111111', 'السلام عليكم')$$, 1);
select tst.fails('الضغط مرتين (نفس client_id) لا يكرر الرسالة',
  $$insert into public.messages (client_id, body) values ('11111111-1111-1111-1111-111111111111', 'السلام عليكم')$$, 'duplicate key');
select tst.count_is('رسالة واحدة فقط محفوظة', $$select * from public.messages where client_id = '11111111-1111-1111-1111-111111111111'$$, 1);
select tst.ok('m1 يرسل في شات الطلعة',
  $$insert into public.messages (ride_id, client_id, body) values (tst.id('ride1'), gen_random_uuid(), 'التجمع 9')$$, 1);
select tst.fails('لا يمكن إرسال رسالة باسم عضو آخر',
  $$insert into public.messages (user_id, client_id, body) values (tst.id('m2'), gen_random_uuid(), 'مزور')$$, 'permission denied');
select tst.fails('لا يمكن تزوير وقت الرسالة',
  $$insert into public.messages (client_id, body, created_at) values (gen_random_uuid(), 'x', now() - interval '1 year')$$, 'permission denied');
select tst.fails('صورة الرسالة يجب أن تكون من مجلد المرسل',
  $$insert into public.messages (client_id, image_path) values (gen_random_uuid(), tst.id('m2')::text || '/chat/a.jpg')$$, 'check constraint');
select tst.fails('رسالة فارغة تُرفض',
  $$insert into public.messages (client_id, body) values (gen_random_uuid(), '   ')$$, 'check constraint');
select tst.as_user('m2');
select tst.count_is('m2 يرى رسائل القروب', 'select * from public.messages', 2);
select tst.ok('m2 لا يحذف رسالة m1 (0 صفوف)', $$delete from public.messages where user_id = tst.id('m1')$$, 0);
select tst.fails('لا تعديل للرسائل', $$update public.messages set body='تعديل'$$, 'permission denied');
select tst.as_user('m1');
select tst.ok('m1 يحذف رسالته', $$delete from public.messages where ride_id = tst.id('ride1') and user_id = auth.uid()$$, 1);
select tst.as_user('m2');
select tst.ok('m2 يرسل رسالة', $$insert into public.messages (client_id, body) values (gen_random_uuid(), 'محتوى مخالف')$$, 1);
select tst.as_user('admin2');
select tst.ok('الأدمن يحذف المحتوى المخالف', $$delete from public.messages where body = 'محتوى مخالف'$$, 1);
select tst.as_user('pending');
select tst.count_is('غير المقبول لا يرى الرسائل', 'select * from public.messages', 0);
select tst.fails('غير المقبول لا يرسل',
  $$insert into public.messages (client_id, body) values (gen_random_uuid(), 'x')$$, 'row-level security');
select tst.as_user('outsider');
select tst.count_is('مستخدم بلا عضوية لا يرى الرسائل', 'select * from public.messages', 0);

-- =====================================================================
select tst.sec('9. مشاركة الموقع');
select tst.as_user('m1');
select tst.fails('لا يمكن الإدراج المباشر في جدول المواقع',
  $$insert into public.member_locations (user_id, lat, lng, share_until) values (auth.uid(), 24.7, 46.6, now()+interval '1 hour')$$, 'permission denied');
select tst.fails('مدة المشاركة لا تتجاوز 12 ساعة',
  $$select public.share_location(24.7, 46.6, 10, null, null, null, now() + interval '13 hours')$$, 'share_too_long');
select tst.fails('لا مشاركة بتاريخ منتهٍ',
  $$select public.share_location(24.7, 46.6, 10, null, null, null, now() - interval '1 minute')$$, 'share_until_past');
select tst.ok('m1 يشارك موقعه لساعة', $$select public.share_location(24.71, 46.67, 12, null, null, null, now() + interval '1 hour')$$);
select tst.ok('تحديث الموقع يستبدل السابق (لا سجل)', $$select public.share_location(24.72, 46.68, 12, null, null, null, now() + interval '1 hour')$$);
select tst.count_is('صف واحد فقط لـ m1', $$select * from public.member_locations where user_id = auth.uid()$$, 1);
select tst.as_user('m2');
select tst.count_is('m2 يرى موقع m1', 'select * from public.member_locations', 1);
select tst.ok('m2 يشارك أثناء الطلعة', $$select public.share_location(24.8, 46.7, 20, null, null, tst.id('ride1'), now() + interval '3 hours')$$);
select tst.ok('m2 لا يحذف موقع m1 (0 صفوف)', $$delete from public.member_locations where user_id = tst.id('m1')$$, 0);
select tst.as_user('pending');
select tst.count_is('غير المقبول لا يرى المواقع', 'select * from public.member_locations', 0);
select tst.fails('غير المقبول لا يشارك موقعه',
  $$select public.share_location(24.7, 46.6, 10, null, null, null, now() + interval '1 hour')$$, 'members_only');
select tst.as_user('m1');
select tst.ok('m1 يوقف المشاركة', $$select public.stop_location_sharing()$$);
select tst.as_user('m2');
select tst.count_is('بعد الإيقاف لا يظهر موقع m1', $$select * from public.member_locations where user_id = tst.id('m1')$$, 0);

select tst.as_user('m1');
select tst.ok('m1 يشارك لمدة ثانيتين', $$select public.share_location(24.7, 46.6, 10, null, null, null, now() + interval '2 seconds')$$);
select tst.as_user('m2');
select tst.count_is('يظهر أثناء المدة', $$select * from public.member_locations where user_id = tst.id('m1')$$, 1);
select pg_sleep(3);
select tst.count_is('بعد انتهاء المدة يختفي فورًا (RLS)', $$select * from public.member_locations where user_id = tst.id('m1')$$, 0);
select tst.as_user('postgres');
select tst.count_is('الصف المنتهي ما زال مخزنًا قبل التنظيف', $$select * from public.member_locations where user_id = tst.id('m1')$$, 1);
select tst.as_user('m2');
select public.share_location(24.81, 46.71, 20, null, null, tst.id('ride1'), now() + interval '3 hours');
select tst.as_user('postgres');
select tst.count_is('أي تحديث موقع يحذف الصفوف المنتهية (لا سجل)', $$select * from public.member_locations where user_id = tst.id('m1')$$, 0);
select tst.as_user('m1');
select tst.ok('المنظّم ينهي الطلعة', $$update public.rides set status = 'completed' where id = tst.id('ride1')$$, 1);
select tst.as_user('postgres');
select tst.count_is('انتهاء الطلعة يحذف المواقع المرتبطة بها', $$select * from public.member_locations where ride_id = tst.id('ride1')$$, 0);
select tst.as_user('m2');
select tst.fails('لا مشاركة موقع لطلعة منتهية',
  $$select public.share_location(24.8, 46.7, 20, null, null, tst.id('ride1'), now() + interval '1 hour')$$, 'ride_closed');
select tst.ok('m2 يؤكد رجوعه بعد انتهاء الطلعة', $$select public.set_progress(tst.id('ride1'), 'returned')$$);
select tst.fails('لا تغيير لتأكيد المشاركة بعد انتهاء الطلعة', $$select public.set_rsvp(tst.id('ride1'), 'maybe')$$, 'ride_closed');

-- =====================================================================
select tst.sec('10. طلب المساعدة');
select tst.as_user('m2');
select tst.ok('m2 يطلب مساعدة (بنشر) مع الموقع',
  $$insert into public.help_requests (kind, description, lat, lng) values ('flat_tire', 'كفر خلفي', 24.9, 46.7)$$, 1);
select tst.fails('طلب مفتوح واحد فقط (يمنع التكرار)',
  $$insert into public.help_requests (kind) values ('fuel')$$, 'duplicate key');
select tst.as_user('m1');
select tst.count_is('m1 يرى الطلب', 'select * from public.help_requests where status = ''open''', 1);
select tst.ok('m1: سأتواصل معه',
  $$insert into public.help_responders (request_id) select id from public.help_requests where user_id = tst.id('m2')$$, 1);
select tst.fails('لا يمكن تعديل الطلب مباشرة',
  $$update public.help_requests set status = 'resolved'$$, 'permission denied');
select tst.as_user('admin2');
select tst.ok('الأدمن يرى من سيتواصل', $$select * from public.help_responders$$);
select tst.as_user('m1');
select tst.ok('المتواصل يعلّم الطلب محلولًا',
  $$select public.resolve_help((select id from public.help_requests where user_id = tst.id('m2')))$$);
select tst.as_user('pending');
select tst.count_is('غير المقبول لا يرى طلبات المساعدة', 'select * from public.help_requests', 0);

-- =====================================================================
select tst.sec('11. الألبوم والتخزين الخاص');
select tst.as_user('m1');
select tst.ok('m1 يرفع ملفًا في مجلده',
  $$insert into storage.objects (bucket_id, name) values ('nightriders', auth.uid()::text || '/rides/' || tst.id('ride1')::text || '/a.jpg')$$, 1);
select tst.ok('m1 يسجّل الوسائط في الألبوم',
  $$insert into public.ride_media (ride_id, path, kind, mime, size_bytes)
    values (tst.id('ride1'), auth.uid()::text || '/rides/' || tst.id('ride1')::text || '/a.jpg', 'image', 'image/jpeg', 350000)$$, 1);
select tst.fails('m1 لا يرفع في مجلد m2',
  $$insert into storage.objects (bucket_id, name) values ('nightriders', tst.id('m2')::text || '/rides/x.jpg')$$, 'row-level security');
select tst.fails('نوع ملف غير مسموح يُرفض',
  $$insert into public.ride_media (ride_id, path, kind, mime, size_bytes)
    values (tst.id('ride1'), auth.uid()::text || '/rides/' || tst.id('ride1')::text || '/b.exe', 'image', 'application/x-msdownload', 100)$$, 'check constraint');
select tst.fails('حجم أكبر من 50MB يُرفض',
  $$insert into public.ride_media (ride_id, path, kind, mime, size_bytes)
    values (tst.id('ride1'), auth.uid()::text || '/rides/' || tst.id('ride1')::text || '/big.mp4', 'video', 'video/mp4', 60000000)$$, 'check constraint');
select tst.as_user('m2');
select tst.count_is('m2 يرى ملفات القروب', $$select * from storage.objects where bucket_id='nightriders'$$, 1);
select tst.ok('m2 لا يحذف ملف m1 (0 صفوف)', $$delete from storage.objects where name like tst.id('m1')::text || '/%'$$, 0);
select tst.ok('m2 لا يحذف وسائط m1 (0 صفوف)', $$delete from public.ride_media where user_id = tst.id('m1')$$, 0);
select tst.as_user('pending');
select tst.count_is('غير المقبول لا يرى الملفات', $$select * from storage.objects$$, 0);
select tst.fails('غير المقبول لا يرفع',
  $$insert into storage.objects (bucket_id, name) values ('nightriders', auth.uid()::text || '/avatars/a.jpg')$$, 'row-level security');
select tst.as_user('anon');
select tst.count_is('الزائر لا يرى الملفات', $$select * from storage.objects$$, 0);
select tst.as_user('postgres');
select tst.count_is('الجداول الأساسية مضافة للتحديث المباشر', $$select * from pg_publication_tables where pubname='supabase_realtime'
  and tablename in ('messages','member_locations','poll_votes','ride_participants','help_requests','profiles')$$, 6);
select tst.count_is('رقم التواصل غير منشور في التحديث المباشر', $$select * from pg_publication_tables where pubname='supabase_realtime' and tablename in ('member_contacts','invites')$$, 0);
select tst.count_is('الحاوية خاصة (public=false)', $$select * from storage.buckets where id='nightriders' and public = false$$, 1);

-- =====================================================================
select tst.sec('12. الإعلانات');
select tst.as_user('m1');
select tst.fails('العضو لا ينشر إعلانًا', $$insert into public.announcements (title) values ('إعلان')$$, 'row-level security');
select tst.as_user('owner');
select tst.ok('الأدمن ينشر إعلانًا مثبتًا', $$insert into public.announcements (title, body) values ('اجتماع الخميس', 'الساعة 9')$$, 1);
select tst.as_user('m2');
select tst.count_is('العضو يرى الإعلان', 'select * from public.announcements where pinned', 1);
select tst.ok('العضو لا يحذف الإعلان (0 صفوف)', 'delete from public.announcements', 0);

-- =====================================================================
select tst.sec('13. إيقاف عضو');
select tst.as_user('m2');
select public.share_location(24.8, 46.7, 20, null, null, null, now() + interval '3 hours');
select tst.as_user('m1');
select tst.fails('العضو لا يوقف عضوًا', $$select public.suspend_member(tst.id('m2'))$$, 'admin_only');
select tst.as_user('admin2');
select tst.fails('الأدمن لا يوقف نفسه', $$select public.suspend_member(auth.uid())$$, 'cannot_suspend_self');
select tst.ok('الأدمن يوقف m2', $$select public.suspend_member(tst.id('m2'))$$);
select tst.as_user('m2');
select tst.count_is('الموقوف يرى ملفه فقط (لعرض رسالة الإيقاف)', 'select * from public.profiles', 1);
select tst.count_is('الموقوف لا يرى الرسائل', 'select * from public.messages', 0);
select tst.count_is('الموقوف لا يرى الطلعات', 'select * from public.rides', 0);
select tst.count_is('الموقوف لا يرى الملفات', 'select * from storage.objects', 0);
select tst.count_is('الموقوف لا يرى المواقع', $$select * from public.member_locations where user_id <> auth.uid()$$, 0);
select tst.fails('الموقوف لا يرسل', $$insert into public.messages (client_id, body) values (gen_random_uuid(), 'x')$$, 'row-level security');
select tst.ok('تعديل الموقوف لملفه لا يمر (0 صفوف)', $$update public.profiles set city = 'x' where id = auth.uid()$$, 0);
select tst.fails('الموقوف لا يعيد التسجيل بدعوة', $$select public.redeem_invite('ABCDEFGHJK','x')$$, 'account_suspended');
select tst.as_user('postgres');
select tst.count_is('إيقاف العضو يحذف موقعه المشارك', $$select * from public.member_locations where user_id = tst.id('m2')$$, 0);
select tst.as_user('m1');
select tst.count_is('الأعضاء لا يرون موقع الموقوف', $$select * from public.member_locations where user_id = tst.id('m2')$$, 0);
select tst.as_user('owner');
select tst.ok('الأدمن يعيد تفعيل m2', $$select public.approve_member(tst.id('m2'))$$);
select tst.ok('الأساسي يوقف الأدمن الإضافي', $$select public.suspend_member(tst.id('admin2'))$$);
select tst.count_is('الأدمن الموقوف يفقد دوره', $$select * from public.profiles where id = tst.id('admin2') and role='member' and status='suspended'$$, 1);
select tst.as_user('admin2');
select tst.fails('الأدمن الموقوف لا ينشئ دعوات', $$select public.create_invite(24, 1, null)$$, 'admin_only');
select tst.count_is('الأدمن الموقوف لا يرى الدعوات', 'select * from public.invites', 0);
select tst.as_user('owner');
select tst.ok('الأدمن يحذف طلعة', $$delete from public.rides where id = tst.id('ride1')$$, 1);

-- =====================================================================
select tst.as_user('postgres');
\echo
\echo '================ نتائج الاختبار ================'
select n as "#", section as "القسم", case when ok then 'PASS' else 'FAIL' end as "النتيجة", name as "الاختبار", detail as "التفاصيل"
from tst.results order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed, count(*) as total from tst.results;
