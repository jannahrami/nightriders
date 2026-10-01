
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
