-- الجولة ٥ — وحدة الدعم الفني (20261120170000): معاملة كاملة تُرجَع في النهاية.
-- بادئة e1.
--   A) إنشاء تذكرة: صحة المدخلات · المرفقات (العدد والمالك) · الرقم المتسلسل
--   B) الإشعار: كل مسؤولي تقنية المعلومات يستلمون إشعاراً
--   C) القائمة: IT فقط · تصفية بالحالة · الترتيب (المفتوحة أولاً)
--   D) القرار: تغيير الحالة · resolved_at · إشعار صاحب التذكرة · الحراسة
--   E) رقم الدعم لجميع البوابات + الحراسة
--   F) سياسات حاوية المرفقات
begin;
set client_min_messages = notice;

create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('auth.user_id', p::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
end $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

insert into auth.users (id, email) values
  ('e1000000-0000-4000-8000-000000000001', 'e1-emp@t.iq'),
  ('e1000000-0000-4000-8000-000000000002', 'e1-it@t.iq'),
  ('e1000000-0000-4000-8000-000000000003', 'e1-it2@t.iq'),
  ('e1000000-0000-4000-8000-000000000004', 'e1-other@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('e1000000-0000-4000-8000-000000000001', 'employee'),
  ('e1000000-0000-4000-8000-000000000002', 'it_admin'),
  ('e1000000-0000-4000-8000-000000000003', 'it_admin'),
  ('e1000000-0000-4000-8000-000000000004', 'employee')
on conflict do nothing;

-- ═══ A) الإنشاء والتحقق ═══
select pg_temp.as_user('e1000000-0000-4000-8000-000000000001');
select pg_temp.expect_error($$select public.support_ticket_create('ab', 'وصف كافٍ', 'other')$$, 'INVALID_INPUT');
select pg_temp.expect_error($$select public.support_ticket_create('عنوان صحيح', 'ab', 'other')$$, 'INVALID_INPUT');
select pg_temp.expect_error($$select public.support_ticket_create('عنوان صحيح', 'وصف كافٍ', 'bogus')$$, 'INVALID_INPUT');
select pg_temp.expect_error($$select public.support_ticket_create('عنوان صحيح', 'وصف كافٍ', 'other', 'urgent')$$, 'INVALID_INPUT');
select pg_temp.expect_error(
  $$select public.support_ticket_create('عنوان صحيح', 'وصف كافٍ', 'other', 'medium', null, null,
      array['a/1.jpg','b/2.jpg','c/3.jpg','d/4.jpg'])$$, 'INVALID_INPUT');
-- مرفق في مجلد مستخدم آخر
select pg_temp.expect_error(
  $$select public.support_ticket_create('عنوان صحيح', 'وصف كافٍ', 'other', 'medium', null, null,
      array['e1000000-0000-4000-8000-000000000004/x.jpg'])$$, 'INVALID_INPUT');

do $$
declare v jsonb; n int;
begin
  v := public.support_ticket_create('تعطل الطابعة في القسم', 'الطابعة لا تطبع وتظهر رسالة خطأ.',
                                    'hardware', 'high', 'hr', '07701234567',
                                    array['e1000000-0000-4000-8000-000000000001/1.jpg']);
  if (v ->> 'ticket_number')::bigint < 1 then raise exception 'A: رقم التذكرة غير صحيح'; end if;

  select count(*) into n from public.support_tickets;
  if n <> 1 then raise exception 'A: يجب أن تُنشأ تذكرة واحدة، جاء %', n; end if;

  v := public.support_ticket_create('مشكلة في الدخول', 'لا أستطيع الدخول إلى البوابة منذ الصباح.');
  if (v ->> 'ticket_number')::bigint <= 1 then raise exception 'A: الترقيم لا يتسلسل'; end if;
end $$;

-- ═══ B) الإشعارات ═══
do $$
declare n int;
begin
  select count(distinct user_id) into n from public.notifications
   where dedupe_key like 'support_ticket:%';
  if n <> 2 then raise exception 'B: يجب إشعار مسؤولي تقنية المعلومات الاثنين، جاء %', n; end if;
end $$;

-- ═══ C) القائمة ═══
select pg_temp.expect_error($$select * from public.support_tickets_list()$$, 'PERMISSION_DENIED');

select pg_temp.as_user('e1000000-0000-4000-8000-000000000002');
do $$
declare n int; first_status text;
begin
  select count(*) into n from public.support_tickets_list();
  if n <> 2 then raise exception 'C: يجب عرض تذكرتين، جاء %', n; end if;

  select status into first_status from public.support_tickets_list() limit 1;
  if first_status <> 'open' then raise exception 'C: المفتوحة يجب أن تتصدّر'; end if;

  select count(*) into n from public.support_tickets_list('closed');
  if n <> 0 then raise exception 'C: لا تذاكر مغلقة بعد'; end if;
end $$;

-- ═══ D) القرار ═══
select pg_temp.as_user('e1000000-0000-4000-8000-000000000001');
select pg_temp.expect_error(
  $$select public.support_ticket_decide((select id from (select id from public.support_tickets limit 1) x), 'resolved')$$,
  'PERMISSION_DENIED');

select pg_temp.as_user('e1000000-0000-4000-8000-000000000002');
select pg_temp.expect_error($$select public.support_ticket_decide(gen_random_uuid(), 'resolved')$$, 'TICKET_NOT_FOUND');
select pg_temp.expect_error(
  $$select public.support_ticket_decide((select id from public.support_tickets order by ticket_number limit 1), 'bogus')$$,
  'INVALID_INPUT');

do $$
declare v_id uuid; v_status text; v_resolved timestamptz; n int;
begin
  select id into v_id from public.support_tickets order by ticket_number limit 1;
  perform public.support_ticket_decide(v_id, 'resolved', 'تم استبدال الطابعة');

  select status, resolved_at into v_status, v_resolved from public.support_tickets where id = v_id;
  if v_status <> 'resolved' then raise exception 'D: الحالة لم تتغيّر'; end if;
  if v_resolved is null then raise exception 'D: resolved_at لم يُسجَّل'; end if;

  select count(*) into n from public.notifications
   where user_id = 'e1000000-0000-4000-8000-000000000001' and dedupe_key like 'support_ticket_upd:%';
  if n < 1 then raise exception 'D: لم يُشعَر صاحب التذكرة'; end if;
end $$;

-- ═══ E) رقم الدعم ═══
do $$
declare v jsonb;
begin
  v := public.support_contact();
  if v is null or not (v ? 'phone') then raise exception 'E: رقم الدعم غير مُعاد'; end if;
end $$;

set local role anon;
select pg_temp.expect_error($$select public.support_contact()$$, 'permission denied');
reset role;

-- ═══ F) حاوية المرفقات ═══
do $$
declare n int;
begin
  select count(*) into n from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and policyname like 'support-attachments:%';
  if n <> 2 then raise exception 'F: سياسات الحاوية يجب أن تكون 2، جاء %', n; end if;
  if not exists (select 1 from storage.buckets where id = 'support-attachments' and public = false) then
    raise exception 'F: الحاوية يجب أن تكون خاصة';
  end if;
end $$;

rollback;
