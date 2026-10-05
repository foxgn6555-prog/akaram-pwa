-- ═══════════════════════════════════════════════════════════════════════════════
-- 00180 · «قاعدة بيانات الشكاوى» — الجدول الشهري بصيغة سجل الشكاوى المعتمد
--  صف لكل شكوى (عنصر) بالأعمدة: التاريخ، وقت الاستلام، اسم المرسل، المركز البلدي، القاطع، الشفت، رقم المحلة،
--  اسم الشارع، نوع التلكؤ، مصدر الشكوى، المسؤول عن المعالجة، منجز/متأخر، نوع المرفقات، تأكيد الاستلام.
--  إعدادات قابلة للضبط من صفحة إعدادات الشكاوى: حدّ الشفت (افتراضي 14:00) ومهلة الإنجاز بالساعات (افتراضي 24).
-- ═══════════════════════════════════════════════════════════════════════════════
insert into public.complaint_settings (key, value, description) values
  ('database', '{"shiftCutoff":"14:00","lateHours":24}', 'قاعدة بيانات الشكاوى: حدّ الشفت الصباحي/المسائي ومهلة الإنجاز بالساعات')
on conflict (key) do nothing;

create or replace function public.complaint_database_rows(p_from date, p_to date, p_sector text default null)
returns table(
  item_id uuid, complaint_id uuid, reference_no text, ticket_name text, received_at timestamptz, received_date date, received_time text,
  sender_name text, municipal_center text, sector text, shift text, neighborhood text, street text, delay_type text, source text,
  handler_name text, item_status text, completion text, hours_to_complete numeric, attachments text, attachments_count int, ack_confirmed boolean)
language plpgsql stable security definer set search_path = public, app as $$
declare v_cut time; v_late numeric; v_cfg jsonb;
begin
  if not app.has_role(array['complaints_officer', 'deputy_director', 'executive_director', 'super_admin']) then raise exception 'COMPLAINT_DATABASE_FORBIDDEN'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then raise exception 'COMPLAINT_DATABASE_RANGE_INVALID'; end if;
  if p_sector is not null and p_sector not in ('karrada', 'zaafaraniya') then raise exception 'COMPLAINT_DATABASE_SECTOR_INVALID'; end if;
  select value into v_cfg from public.complaint_settings where key = 'database';
  v_cut := coalesce(nullif(v_cfg ->> 'shiftCutoff', ''), '14:00')::time;
  v_late := coalesce((v_cfg ->> 'lateHours')::numeric, 24);

  return query
  with base as (
    select i.id as item_id, c.id as complaint_id, c.reference_no, c.received_at,
           timezone('Asia/Baghdad', c.received_at) as local_at,
           coalesce(nullif(m.sender_name, ''), nullif(c.sender_email, ''), nullif(m.sender_email, ''), 'إدخال يدوي') as sender_name,
           coalesce(nullif(i.municipal_center, ''), nullif(c.municipal_center, '')) as municipal_center,
           c.sector, coalesce(nullif(i.neighborhood, ''), nullif(c.neighborhood, '')) as neighborhood,
           coalesce(nullif(i.alley, ''), nullif(c.alley, ''), nullif(i.location_text, '')) as street,
           coalesce(nullif(i.title, ''), nullif(c.complaint_type, '')) as delay_type,
           c.source as raw_source, i.assigned_to, i.status as item_status, i.reviewed_at, i.processed_at, i.sequence_no,
           (select count(*) from public.complaint_media md where md.item_id = i.id and md.media_kind in ('email_attachment', 'before', 'after'))::int as media_count,
           exists (
             select 1 from public.complaint_report_items ri
             join public.complaint_reports r on r.id = ri.report_id
             left join public.complaint_email_deliveries d on d.id = r.delivery_id
             where ri.item_id = i.id and ri.included and (r.status = 'sent' or d.status in ('accepted', 'delivered'))
           ) as acked
    from public.complaint_items i
    join public.complaints c on c.id = i.complaint_id
    left join public.complaint_inbox_messages m on m.id = c.inbox_message_id
    where c.archived_at is null
      and timezone('Asia/Baghdad', c.received_at)::date between p_from and p_to
      and (p_sector is null or c.sector = p_sector)
  )
  select b.item_id, b.complaint_id, b.reference_no,
         b.reference_no || '-' || b.sequence_no::text,
         b.received_at, b.local_at::date, to_char(b.local_at, 'HH24:MI'),
         b.sender_name, b.municipal_center,
         case b.sector when 'karrada' then 'الكرادة' else 'الزعفرانية' end,
         case when b.local_at::time < v_cut then 'الصباحية' else 'المسائية' end,
         b.neighborhood, b.street, b.delay_type,
         case b.raw_source when 'email' then 'البريد الإلكتروني' else 'إدخال يدوي' end,
         case when b.assigned_to is null then null else app.manager_display_name(b.assigned_to) end,
         b.item_status,
         case
           when b.item_status = 'approved' and coalesce(b.reviewed_at, b.processed_at) is not null
                and extract(epoch from (coalesce(b.reviewed_at, b.processed_at) - b.received_at)) / 3600 <= v_late then 'منجز'
           when b.item_status = 'approved' then 'منجز متأخر'
           when extract(epoch from (now() - b.received_at)) / 3600 > v_late then 'متأخر'
           else 'قيد المعالجة'
         end,
         case when b.item_status = 'approved' and coalesce(b.reviewed_at, b.processed_at) is not null
              then round((extract(epoch from (coalesce(b.reviewed_at, b.processed_at) - b.received_at)) / 3600)::numeric, 1) end,
         case when b.media_count = 0 then 'بلا مرفقات' else 'صورة عدد ' || b.media_count::text end,
         b.media_count, b.acked
  from base b
  order by b.received_at, b.sequence_no;
end$$;
grant execute on function public.complaint_database_rows(date, date, text) to authenticated;
