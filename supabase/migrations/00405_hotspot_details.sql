-- 00405 — أداء خريطة النفايات: فصل «تفاصيل البقعة» عن «قائمة الخريطة»
--
-- المشكلة المقيسة: طلب واحد للخريطة كان يُرجع 2.8 م.ب لأن كل بقعة تحمل:
--   vehicles (547 ك.ب) + hours (221 ك.ب) + days (65 ك.ب) لكل شهر — ولا تستخدمها الخريطة
--   إلا داخل لوحة التفاصيل (وعند التصدير فقط).
--
-- الحل: (١) معامل جديد p_details في gps_hotspots_list — الافتراضي true فلا يتغيّر أي مستدعٍ قائم
--       (٢) عند false تُحذف الحقول الثقيلة ويُضاف peak_hour نصياً (تحتاجه نافذة العلامة والتصدير)
--       (٣) دالة جديدة gps_hotspots_details(p_ids) تُرجع الصفوف كاملة عند فتح لوحة البقعة أو عند التصدير
--
-- لا تغيير في الصلاحيات: نفس شرط الأدوار الموجود (ops_room / deputy / executive / it_admin / super_admin).

-- النسخة القديمة (٥ وسائط) تُحذف أولاً وإلا صار النداء بـ٥ وسائط غامضاً بين التوقيعين
drop function if exists public.gps_hotspots_list(date, text[], text[], integer, integer[]);

create or replace function public.gps_hotspots_list(
  p_month date default null,
  p_classes text[] default array['medium','heavy'],
  p_recurrence text[] default null,
  p_min_vehicles integer default 1,
  p_sector_ids integer[] default null,
  p_details boolean default true
)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'app'
as $function$
declare result jsonb; slim jsonb;
begin
  result := public.gps_hotspots_list_00368(p_month, p_classes, p_recurrence, p_min_vehicles, p_sector_ids);
  if result -> 'sync' is null or result -> 'sync' = 'null'::jsonb then
    result := jsonb_set(result, '{rows}', '[]'::jsonb, true);
    result := jsonb_set(result, '{total}', '0'::jsonb, true);
  end if;
  if coalesce(p_details, true) then
    return result;
  end if;
  -- نسخة مخفّفة: بلا vehicles/days/hours + ساعة الذروة كنص (تحسب من hours قبل الحذف)
  select coalesce(jsonb_agg(
           (r - 'vehicles' - 'days' - 'hours')
           || jsonb_build_object('peak_hour', coalesce((
                select string_agg(to_char(x.h, 'FM00') || ':00', ' · ' order by x.n desc)
                from (select e.value::int as n, (e.ord - 1) as h
                      from jsonb_array_elements_text(coalesce(r -> 'hours', '[]'::jsonb)) with ordinality e(value, ord)
                      where e.value::int > 0
                      order by e.value::int desc limit 2) x
              ), '—'))
         ), '[]'::jsonb)
    into slim
  from jsonb_array_elements(coalesce(result -> 'rows', '[]'::jsonb)) r;
  result := jsonb_set(result, '{rows}', slim, true);
  return result;
end $function$;

revoke all on function public.gps_hotspots_list(date, text[], text[], integer, integer[], boolean) from public;
grant execute on function public.gps_hotspots_list(date, text[], text[], integer, integer[], boolean) to authenticated;

-- تفاصيل بقعة/بقع محددة (لوحة البقعة + التصدير) — نفس شرط الأدوار
create or replace function public.gps_hotspots_details(p_ids bigint[])
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'app'
as $function$
declare out_js jsonb;
begin
  if auth.uid() is null or not app.has_role(array['ops_room','deputy_director','executive_director','it_admin','super_admin']) then
    raise exception 'GPS_FORBIDDEN';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(to_jsonb(h) - 'synced_at' order by h.id), '[]'::jsonb)
    into out_js
  from public.gps_hotspots h
  where h.id = any (p_ids);
  return out_js;
end $function$;

revoke all on function public.gps_hotspots_details(bigint[]) from public;
grant execute on function public.gps_hotspots_details(bigint[]) to authenticated;
