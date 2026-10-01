-- اختبار صلاحيات السوق (يشغَّل في Supabase SQL؛ ينتهي بـ RAISE فيتراجع عن كل شيء)
-- النتيجة المتوقعة: insert_ok;block_foreign_photo;block_impersonate;block_expiry_update;limit_5_ok;mark_sold_ok;
-- slot_freed_ok;reactivate_limit_ok;renew_ok;B_sees:6;B_update_rows:0;B_delete_rows:0;B_renew_blocked;
-- suspended_sees:0;susp_insert_blocked;anon_blocked;B_sees_expired:0;owner_sees_expired:1;admin_update_rows:0;admin_delete_rows:1
-- (نتيجة التشغيل الفعلي على المشروع 2026-10-01: مطابقة 20/20)
do $t$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); adm uuid := gen_random_uuid(); s uuid := gen_random_uuid();
  l1 uuid; n int; r text := '';
begin
  insert into auth.users (id, email, aud, role) values (a,'ta@x.t','authenticated','authenticated'),(b,'tb@x.t','authenticated','authenticated'),(adm,'tadm@x.t','authenticated','authenticated'),(s,'ts@x.t','authenticated','authenticated');
  insert into public.profiles (id, display_name, status, role) values (a,'AAA','active','member'),(b,'BBB','active','member'),(adm,'ADM','active','admin'),(s,'SSS','suspended','member');
  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  set local role authenticated;
  insert into public.listings (title, price, category, condition, photos) values ('دباب للبيع', 25000, 'bike','used', array[a::text||'/market/x.jpg']) returning id into l1;
  r := r || 'insert_ok;';
  begin insert into public.listings (title, category, condition, photos) values ('سرقة', 'other','new', array[b::text||'/market/x.jpg']); r := r || 'FAIL_foreign_photo;'; exception when others then r := r || 'block_foreign_photo;'; end;
  begin insert into public.listings (user_id, title, category, condition) values (b, 'باسم غيري', 'other','new'); r := r || 'FAIL_impersonate;'; exception when others then r := r || 'block_impersonate;'; end;
  begin update public.listings set expires_at = now() + interval '1 year' where id = l1; r := r || 'FAIL_expiry;'; exception when others then r := r || 'block_expiry_update;'; end;
  for i in 1..4 loop insert into public.listings (title, category, condition) values ('اعلان '||i, 'other','new'); end loop;
  begin insert into public.listings (title, category, condition) values ('سادس', 'other','new'); r := r || 'FAIL_limit;'; exception when others then r := r || case when sqlerrm like '%listing_limit%' then 'limit_5_ok;' else 'limit_other;' end; end;
  update public.listings set status='sold' where id = l1; r := r || 'mark_sold_ok;';
  insert into public.listings (title, category, condition) values ('بعد البيع', 'other','new'); r := r || 'slot_freed_ok;';
  begin update public.listings set status='active' where id = l1; r := r || 'FAIL_reactivate_over_limit;'; exception when others then r := r || 'reactivate_limit_ok;'; end;
  perform public.renew_listing(l1); r := r || 'renew_ok;';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',b,'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.listings where user_id = a; r := r || 'B_sees:'||n||';';
  update public.listings set title='hacked' where id = l1; get diagnostics n = row_count; r := r || 'B_update_rows:'||n||';';
  delete from public.listings where id = l1; get diagnostics n = row_count; r := r || 'B_delete_rows:'||n||';';
  begin perform public.renew_listing(l1); r := r || 'FAIL_B_renew;'; exception when others then r := r || 'B_renew_blocked;'; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',s,'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.listings; r := r || 'suspended_sees:'||n||';';
  begin insert into public.listings (title, category, condition) values ('xx', 'other','new'); r := r || 'FAIL_susp_insert;'; exception when others then r := r || 'susp_insert_blocked;'; end;
  reset role;
  set local role anon;
  begin select count(*) into n from public.listings; r := r || 'FAIL_anon_read;'; exception when others then r := r || 'anon_blocked;'; end;
  reset role;
  update public.listings set expires_at = now() - interval '1 day' where user_id = a and title = 'اعلان 1';
  perform set_config('request.jwt.claims', json_build_object('sub',b,'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.listings where user_id = a and title = 'اعلان 1'; r := r || 'B_sees_expired:'||n||';';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.listings where title = 'اعلان 1' and user_id = a; r := r || 'owner_sees_expired:'||n||';';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  set local role authenticated;
  update public.listings set title='adm' where id = l1; get diagnostics n = row_count; r := r || 'admin_update_rows:'||n||';';
  delete from public.listings where id = l1; get diagnostics n = row_count; r := r || 'admin_delete_rows:'||n||';';
  reset role;
  raise exception 'RESULT %', r;
end $t$;
