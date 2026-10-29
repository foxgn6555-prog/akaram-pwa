-- 00324 — 00380: ربط المشروع الأول بمستودع GPS التحليلي (المشروع الثاني).
-- المفاتيح لا تُخزَّن هنا أبداً (Secrets في دوال الحافة). هذا الجدول = حالة الربط فقط (آخر فحص/آخر مزامنة سجل) لعرضها في IT.
create table if not exists public.gps_warehouse_link (
  id int primary key default 1 check (id = 1),
  warehouse_host text,
  last_ping_at timestamptz, last_ping_ok boolean, schema_version int, ping jsonb,
  last_registry_sync_at timestamptz, registry_active int,
  last_error_code text, last_error_at timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.gps_warehouse_link (id) values (1) on conflict (id) do nothing;
alter table public.gps_warehouse_link enable row level security;
drop policy if exists "gps warehouse link read" on public.gps_warehouse_link;
create policy "gps warehouse link read" on public.gps_warehouse_link for select to authenticated using (app.has_role(array['ops_room','it_admin','super_admin']));
revoke insert, update, delete on public.gps_warehouse_link from anon, authenticated;

-- حالة الربط لشاشة IT
create or replace function public.gps_warehouse_link_get() returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
begin
  if auth.uid() is null or not app.has_role(array['ops_room','it_admin','super_admin']) then raise exception 'GPS_FORBIDDEN'; end if;
  return (select to_jsonb(l) from public.gps_warehouse_link l where id = 1);
end $$;

-- سجل الآليات الذي يُرسل إلى المستودع: كل آلية غير مؤرشفة + جهازها إن وُجد (خدمة/IT فقط)
create or replace function public.gps_warehouse_registry() returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not (auth.role() = 'service_role' or (auth.uid() is not null and app.has_role(array['it_admin','super_admin']))) then raise exception 'GPS_FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'vehicle_id', v.id, 'db_number', v.db_number, 'vehicle_name', v.vehicle_name, 'plate_number', v.plate_number,
      'sector_id', v.sector_id, 'sector_name', s.name, 'device_id', d.id, 'device_external_id', d.external_id, 'device_name', d.name) order by v.db_number, v.vehicle_name)
    from public.garage_vehicles v
    left join public.sectors s on s.id = v.sector_id
    left join public.gps_vehicle_bindings b on b.garage_vehicle_id = v.id
    left join public.gps_devices d on d.id = b.device_id
    where v.archived_at is null), '[]'::jsonb);
end $$;

-- تُستدعى من دالة الحافة (مفتاح الخدمة) لتسجيل نتيجة الفحص/المزامنة
create or replace function public.gps_warehouse_link_record(p_kind text, p_ok boolean, p_payload jsonb default '{}'::jsonb, p_host text default null, p_error text default null) returns void
language plpgsql security definer set search_path = public, app as $$
begin
  if auth.role() <> 'service_role' then raise exception 'GPS_FORBIDDEN'; end if;
  if p_kind not in ('ping', 'registry') then raise exception 'GPS_WAREHOUSE_KIND_INVALID'; end if;
  update public.gps_warehouse_link set
    warehouse_host = coalesce(p_host, warehouse_host),
    last_ping_at = case when p_kind = 'ping' then now() else last_ping_at end,
    last_ping_ok = case when p_kind = 'ping' then p_ok else last_ping_ok end,
    schema_version = case when p_kind = 'ping' and p_ok then nullif(p_payload ->> 'schema_version', '')::int else schema_version end,
    ping = case when p_kind = 'ping' and p_ok then p_payload else ping end,
    last_registry_sync_at = case when p_kind = 'registry' and p_ok then now() else last_registry_sync_at end,
    registry_active = case when p_kind = 'registry' and p_ok then nullif(p_payload ->> 'active', '')::int else registry_active end,
    last_error_code = case when p_ok then null else coalesce(p_error, 'GPS_WAREHOUSE_FAILED') end,
    last_error_at = case when p_ok then last_error_at else now() end,
    updated_at = now()
  where id = 1;
end $$;

revoke all on function public.gps_warehouse_link_get(), public.gps_warehouse_registry(), public.gps_warehouse_link_record(text, boolean, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.gps_warehouse_link_get(), public.gps_warehouse_registry() to authenticated;
