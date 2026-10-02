-- 00169 · الدعم المباشر: صور في المحادثة (التقاط/إرسال من المواطن) + أرشيف المحادثات المنتهية حسب اليوم (غرفة العمليات)

alter table public.citizen_chat_messages add column if not exists attachment_path text;

-- المواطن يقرأ ملفات مجلد رمزه فقط (روابط موقّعة لصوره في المحادثة/الشكوى)
drop policy if exists "citizen storage: citizen read own folder" on storage.objects;
create policy "citizen storage: citizen read own folder" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'citizen-complaints' and app.citizen_token_valid((storage.foldername(name))[1]));

-- json المحادثة يتضمن المرفق
create or replace function app.citizen_chat_json(s public.citizen_chat_sessions, p_after bigint default 0) returns jsonb
language sql stable security definer set search_path = public, app as $$
  select jsonb_build_object(
    'id', s.id, 'status', s.status, 'agent_name', s.agent_name, 'requested_at', s.requested_at, 'accepted_at', s.accepted_at,
    'closed_at', s.closed_at, 'closed_by', s.closed_by, 'rating', s.rating, 'rating_note', s.rating_note,
    'queue_position', case when s.status = 'waiting' then (select count(*) from public.citizen_chat_sessions q where q.status = 'waiting' and q.requested_at < s.requested_at) + 1 end,
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'sender', m.sender, 'body', m.body, 'attachment', m.attachment_path, 'at', m.created_at) order by m.id)
                          from public.citizen_chat_messages m where m.session_id = s.id and m.id > p_after), '[]'::jsonb))
$$;

-- إرسال رسالة مع صورة اختيارية (المسار داخل مجلد الرمز حصراً)
create or replace function public.citizen_chat_send(p_token uuid, p_body text, p_attachment text default null) returns bigint
language plpgsql security definer set search_path = public, app as $$
declare a public.citizen_accounts; s public.citizen_chat_sessions; v_id bigint; v_body text := btrim(coalesce(p_body, ''));
begin
  a := app.citizen_by_token(p_token);
  if p_attachment is not null and split_part(p_attachment, '/', 1) <> a.token::text then raise exception 'CITIZEN_PHOTO_PATH_INVALID'; end if;
  if (length(v_body) = 0 and p_attachment is null) or length(v_body) > 2000 then raise exception 'CITIZEN_MESSAGE_INVALID'; end if;
  select * into s from public.citizen_chat_sessions where citizen_id = a.id and status <> 'closed' order by requested_at desc limit 1;
  if not found then raise exception 'CITIZEN_CHAT_CLOSED'; end if;
  if (select count(*) from public.citizen_chat_messages m where m.session_id = s.id and m.sender = 'citizen' and m.created_at > now() - interval '1 minute') >= 30 then
    raise exception 'CITIZEN_RATE_LIMIT';
  end if;
  insert into public.citizen_chat_messages (session_id, sender, body, attachment_path)
  values (s.id, 'citizen', case when length(v_body) = 0 then '📷 صورة' else v_body end, p_attachment) returning id into v_id;
  return v_id;
end$$;
drop function if exists public.citizen_chat_send(uuid, text);
grant execute on function public.citizen_chat_send(uuid, text, text) to anon, authenticated;

-- ── أرشيف المحادثات: الأيام التي فيها محادثات (آخر 90 يوماً) + محادثات يوم محدد ──
create or replace function public.ops_citizen_chat_days(p_limit int default 90) returns jsonb
language plpgsql security definer set search_path = public, app as $$
begin
  if not app.citizen_is_staff() then raise exception 'CITIZEN_FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('day', d, 'count', n, 'closed', c, 'avg_rating', r) order by d desc)
    from (select (requested_at at time zone 'Asia/Baghdad')::date d, count(*) n, count(*) filter (where status = 'closed') c, round(avg(rating)::numeric, 1) r
          from public.citizen_chat_sessions group by 1 order by 1 desc limit greatest(1, least(p_limit, 365))) t), '[]'::jsonb);
end$$;

create or replace function public.ops_citizen_chat_history(p_day date) returns jsonb
language plpgsql security definer set search_path = public, app as $$
begin
  if not app.citizen_is_staff() then raise exception 'CITIZEN_FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id, 'status', s.status, 'citizen_name', a.full_name, 'phone', a.phone, 'requested_at', s.requested_at, 'accepted_at', s.accepted_at, 'closed_at', s.closed_at,
      'closed_by', s.closed_by, 'agent_name', s.agent_name, 'rating', s.rating, 'rating_note', s.rating_note,
      'wait_minutes', case when s.accepted_at is not null then round(extract(epoch from (s.accepted_at - s.requested_at)) / 60) end,
      'duration_minutes', case when s.closed_at is not null then round(extract(epoch from (s.closed_at - s.requested_at)) / 60) end,
      'messages', (select count(*) from public.citizen_chat_messages m where m.session_id = s.id and m.sender <> 'system'),
      'attachments', (select count(*) from public.citizen_chat_messages m where m.session_id = s.id and m.attachment_path is not null))
      order by s.requested_at desc)
    from public.citizen_chat_sessions s join public.citizen_accounts a on a.id = s.citizen_id
    where (s.requested_at at time zone 'Asia/Baghdad')::date = p_day), '[]'::jsonb);
end$$;
grant execute on function public.ops_citizen_chat_days(int), public.ops_citizen_chat_history(date) to authenticated;
