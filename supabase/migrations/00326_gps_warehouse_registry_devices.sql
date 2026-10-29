-- 00326 (00381-ب): سجل المستودع يشمل كل أجهزة GPS النشطة — لا الآليات المربوطة في الكراج فقط
-- السبب: الكراج فيه آليات قليلة مربوطة بينما الأسطول 227 جهازاً في LVN؛ المحرّك يسحب بالجهاز (device_external_id)
-- القاعدة: آلية كراج غير مؤرشفة ⇒ صف باسمها (مع جهازها إن وُجد)؛ جهاز نشط غير مربوط بآلية غير مؤرشفة ⇒ صف باسم الجهاز
-- (vehicle_id = معرّف الجهاز، source = 'device'). عند ربطه لاحقاً في الكراج ينتقل الاسم تلقائياً ومهام الجهاز تبقى كما هي.
create or replace function public.gps_warehouse_registry() returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not (auth.role() = 'service_role' or (auth.uid() is not null and app.has_role(array['it_admin','super_admin']))) then raise exception 'GPS_FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(row order by sort_key) from (
    select jsonb_build_object('source', 'vehicle',
      'vehicle_id', v.id, 'db_number', v.db_number, 'vehicle_name', v.vehicle_name, 'plate_number', v.plate_number,
      'sector_id', v.sector_id, 'sector_name', s.name, 'device_id', d.id, 'device_external_id', d.external_id, 'device_name', d.name) as row,
      '0' || coalesce(v.db_number, '') || v.vehicle_name as sort_key
    from public.garage_vehicles v
    left join public.sectors s on s.id = v.sector_id
    left join public.gps_vehicle_bindings b on b.garage_vehicle_id = v.id
    left join public.gps_devices d on d.id = b.device_id
    where v.archived_at is null
    union all
    select jsonb_build_object('source', 'device',
      'vehicle_id', d.id, 'db_number', null, 'vehicle_name', d.name, 'plate_number', d.plate_number,
      'sector_id', null, 'sector_name', null, 'device_id', d.id, 'device_external_id', d.external_id, 'device_name', d.name),
      '1' || d.name
    from public.gps_devices d
    where d.is_active
      and not exists (select 1 from public.gps_vehicle_bindings b join public.garage_vehicles v on v.id = b.garage_vehicle_id
                      where b.device_id = d.id and v.archived_at is null)
  ) q), '[]'::jsonb);
end $$;
revoke all on function public.gps_warehouse_registry() from public, anon, authenticated;
grant execute on function public.gps_warehouse_registry() to authenticated, service_role;
