-- 00133 · معاينة الإسناد في نافذة الانطلاق تعكس ارتداد القاطع (تكامل مع 00132).
-- المشكلة: garage_shift_dispatch_recipients كان يعدّد المسؤولين الذين يغطون المنطقة مباشرة فقط،
-- فتظهر «لم يُهيأ مسؤول» في الواجهة رغم أن الخادم يرتد لمسؤول القاطع عند التسجيل الفعلي.
-- الحل: نفس دلالة app.resolve_sector_shift_manager:
--   · تغطية مباشرة (أي شفت، عقد 00114): صف لكل مدير مباشر (التعدد يبقى ظاهراً كتحذير تداخل)
--   · غياب مباشر: صف واحد = مرتد القاطع (قطاع شقيق ضمن القاطع الأب) بنفس ترتيب resolve
--   · عمود resolution يميز: direct | parent_fallback

drop function if exists public.garage_shift_dispatch_recipients(uuid, text);

create function public.garage_shift_dispatch_recipients(p_vehicle_id uuid, p_shift text)
returns table(user_id uuid, manager_name text, shift text, sectors smallint[], resolution text)
language plpgsql stable security definer set search_path=public,app as $$
declare
  sid smallint;
  direct_count integer;
  parent text;
begin
  perform app.require_garage_actor();
  if not app.garage_vehicle_allowed(p_vehicle_id) then raise exception 'GARAGE_VEHICLE_SCOPE_FORBIDDEN'; end if;
  select a.sector_id into sid
  from public.garage_vehicle_shift_assignments a
  where a.vehicle_id = p_vehicle_id and a.shift = p_shift and a.ends_at is null;
  if sid is null then return; end if;

  select count(*) into direct_count
  from public.manager_profiles mp
  where sid = any(mp.sectors)
    and exists (select 1 from public.user_roles ur where ur.user_id = mp.user_id and ur.role = 'department_manager');

  if direct_count > 0 then
    return query
    select mp.user_id,
           coalesce(nullif(e.full_name, ''), u.email, mp.user_id::text),
           mp.shift, mp.sectors, 'direct'
    from public.manager_profiles mp
    left join public.employees e on e.user_id = mp.user_id
    left join auth.users u on u.id = mp.user_id
    where sid = any(mp.sectors)
      and exists (select 1 from public.user_roles ur where ur.user_id = mp.user_id and ur.role = 'department_manager')
    order by 2;
  end if;

  select s.parent_sector into parent from public.sectors s where s.id = sid;
  return query
  select mp.user_id,
         coalesce(nullif(e.full_name, ''), u.email, mp.user_id::text),
         mp.shift, mp.sectors, 'parent_fallback'
  from public.manager_profiles mp
  left join public.employees e on e.user_id = mp.user_id
  left join auth.users u on u.id = mp.user_id
  where exists (select 1 from public.sectors sx where sx.id = any(mp.sectors) and sx.parent_sector = parent)
    and exists (select 1 from public.user_roles ur where ur.user_id = mp.user_id and ur.role = 'department_manager')
  order by (mp.shift = p_shift) desc, mp.created_at, mp.user_id
  limit 1;
end$$;

revoke all on function public.garage_shift_dispatch_recipients(uuid, text) from public, anon;
grant execute on function public.garage_shift_dispatch_recipients(uuid, text) to authenticated;
