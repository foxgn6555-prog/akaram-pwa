-- 00243 — صيانة الزعفرانية (٤/٤): صفحة «ورش الصيانة» في التطوير المركزية.
-- • قائمة الورش بعدد الحسابات والحالات المفتوحة + حسابات كل ورشة (مع رابط تفاصيل المستخدم).
-- • تفعيل/إيقاف ورشة فرعية: لا توقَف المركزية؛ لا توقَف ورشة لديها حالات مفتوحة؛ الورشة الموقوفة ⇒ حساباتها تعمل كالمركزية وتوجيه قاطعها يعود إلى المركزية.

-- ورشة الحساب: الإسناد إلى ورشة موقوفة يُعامل كالمركزية
create or replace function app.maintenance_workshop() returns text language plpgsql stable security definer set search_path = public, app as $$
declare w text;
begin
  if app.has_role(array['ops_room','super_admin','it_admin','deputy_director','executive_director','central_garage_officer','department_manager','transfer_station']) then return null; end if;
  if not app.has_role(array['maintenance']) then return null; end if;
  select a.workshop_key into w from public.maintenance_workshop_accounts a join public.maintenance_workshops ws on ws.key = a.workshop_key and ws.is_active where a.user_id = auth.uid();
  return coalesce(w, 'central');
end$$;

create or replace function public.maintenance_workshop_set_active(p_key text, p_is_active boolean) returns jsonb language plpgsql security definer set search_path = public, app as $$
declare n int;
begin
  if not app.has_role(array['it_admin','super_admin']) then raise exception 'IT_FORBIDDEN'; end if;
  if not exists (select 1 from public.maintenance_workshops where key = p_key) then raise exception 'MAINTENANCE_WORKSHOP_INVALID'; end if;
  if p_key = 'central' and not p_is_active then raise exception 'MAINTENANCE_WORKSHOP_CENTRAL_REQUIRED'; end if;
  if not p_is_active then
    select count(*) into n from public.vehicle_maintenance_cases where workshop_key = p_key and completed_at is null;
    if n > 0 then raise exception 'MAINTENANCE_WORKSHOP_HAS_OPEN_CASES'; end if;
  end if;
  update public.maintenance_workshops set is_active = p_is_active where key = p_key;
  insert into public.audit_logs (table_name, record_id, operation, new_row, actor_id, actor_role)
  values ('maintenance_workshops', p_key, 'UPDATE', jsonb_build_object('is_active', p_is_active), auth.uid(), 'it_admin');
  return public.maintenance_workshops_list();
end$$;

-- حسابات الصيانة مع ورشتها (للتطوير المركزية)
create or replace function public.maintenance_workshop_accounts_list() returns table(user_id uuid, display_name text, email text, workshop_key text, workshop_name text, explicit boolean, assigned_at timestamptz, department_name text)
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not app.has_role(array['it_admin','super_admin']) then raise exception 'IT_FORBIDDEN'; end if;
  return query
  select ur.user_id, app.manager_display_name(ur.user_id), u.email::text,
         coalesce(case when w.is_active then a.workshop_key end, 'central'),
         coalesce(case when w.is_active then w.name end, 'الصيانة المركزية'),
         a.user_id is not null, a.assigned_at,
         (select d.name::text from public.employees e join public.departments d on d.id = e.department_id where e.user_id = ur.user_id limit 1)
    from public.user_roles ur
    join auth.users u on u.id = ur.user_id
    left join public.maintenance_workshop_accounts a on a.user_id = ur.user_id
    left join public.maintenance_workshops w on w.key = a.workshop_key
   where ur.role = 'maintenance'
   order by 4, 2;
end$$;

revoke all on function public.maintenance_workshop_set_active(text, boolean), public.maintenance_workshop_accounts_list() from public, anon;
grant execute on function public.maintenance_workshop_set_active(text, boolean), public.maintenance_workshop_accounts_list() to authenticated;
