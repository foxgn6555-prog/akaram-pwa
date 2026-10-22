-- 00273 — الاحتفاظ بالبيانات (٣): تغذية التصدير من المتصفح
-- يعيد صفوف الطلب القابلة للحذف (غير المحمية، الأقدم من المهلة) على دفعات مرتبة بمؤشر ثابت،
-- بأسماء أعمدة عربية جاهزة لملف CSV/JSON. العدد الكلي المعاد عبر الدفعات = rows_deletable بالضبط (إثبات التصدير).
create or replace function public.data_retention_export_rows(p_request uuid, p_after jsonb default null, p_limit int default 2000)
returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare r public.data_retention_requests; lim int := greatest(1, least(coalesce(p_limit, 2000), 5000)); rows jsonb; nxt jsonb; cnt int;
begin
  perform app.require_it();
  select * into r from public.data_retention_requests where id = p_request;
  if r.id is null then raise exception 'RETENTION_NOT_FOUND'; end if;
  if r.status not in ('pending','exported') then raise exception 'RETENTION_BAD_STATE: %', r.status; end if;

  if r.data_key = 'biometric_raw_punches' then
    with page as (
      select b.id, b.punched_at, b.device_serial, d.name as device_name, b.pin, e.employee_number, e.full_name, b.person_name, b.direction, b.method, b.created_at
      from public.biometric_punches b
      left join public.biometric_devices d on d.id = b.device_id
      left join public.employees e on e.id = b.employee_id
      where b.punched_at < r.cutoff
        and exists (select 1 from public.payrolls pr where pr.period_month = date_trunc('month', (b.punched_at at time zone 'Asia/Baghdad'))::date and pr.status in ('approved','paid'))
        and (p_after is null or (b.punched_at, b.id) > ((p_after ->> 't')::timestamptz, (p_after ->> 'id')::uuid))
      order by b.punched_at, b.id limit lim)
    select coalesce(jsonb_agg(jsonb_build_object(
             'وقت البصمة', to_char(p.punched_at at time zone 'Asia/Baghdad', 'YYYY-MM-DD HH24:MI:SS'),
             'الجهاز', coalesce(p.device_name, ''), 'الرقم التسلسلي للجهاز', p.device_serial,
             'رقم البصمة', p.pin, 'الرقم الوظيفي', coalesce(p.employee_number, ''), 'اسم الموظف', coalesce(p.full_name, p.person_name, ''),
             'الاتجاه', case p.direction when 'in' then 'دخول' when 'out' then 'خروج' else 'غير محدد' end,
             'طريقة الوصول', p.method, 'وقت التسجيل', to_char(p.created_at at time zone 'Asia/Baghdad', 'YYYY-MM-DD HH24:MI:SS'),
             'المعرّف', p.id) order by p.punched_at, p.id), '[]'::jsonb),
           count(*), (select jsonb_build_object('t', max(x.punched_at), 'id', (array_agg(x.id order by x.punched_at desc, x.id desc))[1]) from page x)
      into rows, cnt, nxt from page p;
  elsif r.data_key = 'gps_position_history' then
    with page as (
      select h.id, h.fix_time, h.received_at, d.name as device_name, d.external_id, v.vehicle_name, v.db_number, v.plate_number,
             h.latitude, h.longitude, h.speed, h.speed_unit, h.course, h.altitude, h.address
      from public.gps_device_position_history h
      join public.gps_devices d on d.id = h.device_id
      left join public.gps_vehicle_bindings vb on vb.device_id = h.device_id
      left join public.garage_vehicles v on v.id = vb.garage_vehicle_id
      where h.fix_time < r.cutoff and not app.data_retention_gps_locked(h.device_id, h.fix_time)
        and (p_after is null or h.id > (p_after ->> 'id')::bigint)
      order by h.id limit lim)
    select coalesce(jsonb_agg(jsonb_build_object(
             'وقت الموقع', to_char(p.fix_time at time zone 'Asia/Baghdad', 'YYYY-MM-DD HH24:MI:SS'),
             'الجهاز', p.device_name, 'معرّف الجهاز', p.external_id,
             'الآلية', coalesce(p.vehicle_name, ''), 'رقم الدائرة', coalesce(p.db_number, ''), 'اللوحة', coalesce(p.plate_number, ''),
             'خط العرض', p.latitude, 'خط الطول', p.longitude, 'السرعة', p.speed, 'وحدة السرعة', coalesce(p.speed_unit, ''),
             'الاتجاه (درجة)', p.course, 'الارتفاع', p.altitude, 'العنوان', coalesce(p.address, ''),
             'وقت الاستلام', to_char(p.received_at at time zone 'Asia/Baghdad', 'YYYY-MM-DD HH24:MI:SS'), 'المعرّف', p.id) order by p.id), '[]'::jsonb),
           count(*), jsonb_build_object('id', max(p.id))
      into rows, cnt, nxt from page p;
  else
    raise exception 'RETENTION_UNKNOWN_KEY: %', r.data_key;
  end if;

  return jsonb_build_object('rows', rows, 'count', cnt, 'next', case when cnt < lim then null else nxt end,
                            'label', (select c.label from app.data_retention_catalog() c where c.data_key = r.data_key), 'cutoff', r.cutoff);
end$$;
revoke all on function public.data_retention_export_rows(uuid, jsonb, int) from public;
grant execute on function public.data_retention_export_rows(uuid, jsonb, int) to authenticated;
