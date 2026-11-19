-- 20261119120000 — مواءمة الحضور اليدوي مع «الموظفين بلا رقم بصمة»
--
-- الخلل الذي تعالجه هذه الترحيلة (بعد 20261118130000 · 20261118150000):
--   التحديث السابق أزال شرط biometric_pin من دوال النطاق والكشف، فأصبح الموظف بلا بصمة
--   يظهر فعلاً في الكشف — لكن ثلاث دوال قراءة بقيت تحسب البصمة بمنطقها القديم، فنتج تناقض:
--     ① attendance_manual_scope_preview: «employees» = أصحاب البصمة فقط ⇒ أي نطاق بلا بصمة
--        يظهر صفراً، فتُقفل واجهة التطوير زر التفعيل (emptyScope) وتمنع الحضور اليدوي عمّن
--        هو أولى الناس به (قسم بلا جهاز بصمة). كما كانت «no_pin» تُعدّ المتعهدين بلا بصمة.
--     ② attendance_manual_list: بطاقة التفعيل تقول «1 موظف» ونطاقه 7 موظفين.
--     ③ manual_att_sheet_get: «excluded.no_pin» تعرض بلا بصمة كأنهم خارج الكشف، وهم داخله.
--
-- ما تفعله هذه الترحيلة (قراءة/عدّ فقط — لا بيانات ولا حضور ولا رواتب ولا أجهزة):
--   ① إعادة تعريف المعاينة: «employees» = كل موظفي النطاق غير المتعهدين (ببصمة أو بلا)،
--      و«no_pin» = منهم بلا رقم بصمة (لا يشمل المتعهدين — لهم عدّادهم)، و«sample» = أسماؤهم.
--   ② إعادة تعريف القائمة: «employees» = كل موظفي نطاق التفعيل غير المتعهدين.
--   ③ ترقيع محروس لدالة الكشف: «excluded.no_pin» تصبح 0 (لم يبقَ مستبعداً بلا بصمة)،
--      ويُضاف مفتاح جديد «included_no_pin» = عدد المشمولين في الكشف بلا رقم بصمة.
--      الترقيع يجري على نصّ الدالة الحيّ بـ«يجب أن يوجد المرجع مرة واحدة بالضبط»،
--      فلا يُعاد كتابة الدالة ولا تُفقد تحسينات 20261118150000 (نافذة الأيام المعلّقة).
--
-- ما لا تغيّره: لا جدول، لا عمود، لا فهرس، لا صلاحية، ولا صف بيانات واحد.
-- التراجع: إعادة تعريف الدالتين الأوليين بنصّهما السابق، وحذف المفتاح الجديد من الثالثة.

-- ⓪ فحص مسبق: كل ما نعتمد عليه موجود، وإلا تتوقف الترحيلة قبل أي تغيير
do $pre$
begin
  if to_regclass('public.attendance_manual_activations') is null then
    raise exception 'ATT_NO_PIN_PRECHECK: جدول التفعيلات غير موجود — نفّذ 20261118130000 أولاً';
  end if;
  if to_regprocedure('app.manual_att_sheet_rows(uuid,date)') is null
     or to_regprocedure('app.manual_att_is_contractor(uuid)') is null
     or to_regprocedure('app.hr_department_tree(uuid)') is null
     or to_regprocedure('public.manual_att_sheet_get(uuid,date)') is null
     or to_regprocedure('public.attendance_manual_list(boolean)') is null
     or to_regprocedure('public.attendance_manual_scope_preview(uuid,uuid,boolean)') is null then
    raise exception 'ATT_NO_PIN_PRECHECK: دالة أو أكثر من دوال الحضور اليدوي غير موجودة';
  end if;
end $pre$;

-- ① معاينة النطاق: من يدخل الكشف فعلاً = كل موظفي النطاق غير المتعهدين، ببصمة أو بلا بصمة
create or replace function public.attendance_manual_scope_preview(p_branch uuid default null, p_department uuid default null, p_include_sub boolean default true) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare v_all int; v_nopin int; v_contr int; v_sample jsonb; v_over jsonb; today date := app.hr_local_date(now());
begin
  perform app.require_can('it.integrations.attendance-manual', 'view');
  if p_branch is null and p_department is null then raise exception 'ATT_MANUAL_SCOPE_REQUIRED'; end if;
  with sc as (
    select e.id, e.full_name, e.biometric_pin, app.manual_att_is_contractor(e.id) as is_contr
      from public.employees e
     where e.archived_at is null and (e.terminated_at is null or e.terminated_at >= today)
       and (p_branch is null or e.branch_id = p_branch)
       and (p_department is null or e.department_id = p_department or (coalesce(p_include_sub, true) and e.department_id in (select app.hr_department_tree(p_department)))))
  select count(*) filter (where not is_contr),
         count(*) filter (where biometric_pin is null and not is_contr),
         count(*) filter (where is_contr),
         coalesce(jsonb_agg(full_name order by full_name) filter (where not is_contr), '[]'::jsonb),
         (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'portal', o.portal, 'portal_label', app.manual_att_portal_label(o.portal))), '[]'::jsonb)
            from public.attendance_manual_activations o
           where o.status = 'active'
             and (o.branch_id is null or p_branch is null or o.branch_id = p_branch)
             and (o.department_id is null or p_department is null or o.department_id = p_department
                  or (o.include_sub_departments and p_department in (select app.hr_department_tree(o.department_id)))
                  or (coalesce(p_include_sub, true) and o.department_id in (select app.hr_department_tree(p_department)))))
    into v_all, v_nopin, v_contr, v_sample, v_over
    from sc;
  -- employees = من يدخل الكشف فعلاً (ببصمة أو بلا). لا صفر لمجرد غياب البصمة.
  return jsonb_build_object('employees', coalesce(v_all, 0), 'no_pin', coalesce(v_nopin, 0), 'contractors', coalesce(v_contr, 0),
    'sample', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select jsonb_array_elements(v_sample) x limit 8) s), 'overlapping', v_over);
end$$;

-- ② قائمة التفعيلات: عدّاد الموظفين يشمل الجميع (كان يحسب أصحاب البصمة فقط)
create or replace function public.attendance_manual_list(p_only_active boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare today date := app.hr_local_date(now()); out jsonb := '[]'::jsonb; a record; v_pending int; v_dates int; v_entries int; v_emp int;
begin
  perform app.require_can('it.integrations.attendance-manual', 'view');
  for a in select * from public.attendance_manual_activations x where (not coalesce(p_only_active, false)) or x.status = 'active' order by (x.status = 'active') desc, x.activated_at desc limit 200 loop
    select count(distinct (p.employee_id, p.work_date)), count(distinct p.work_date) into v_pending, v_dates
      from app.manual_att_pending_days(a.starts_on, least(coalesce(a.ends_on, today), today), a.id) p;
    select count(*) into v_entries from public.attendance_manual_entries en where en.activation_id = a.id;
    -- بلا شرط بصمة: الموظف بلا بصمة مشمول بالتفعيل ويظهر في الكشف
    select count(*) into v_emp from public.employees e
     where e.archived_at is null and (e.terminated_at is null or e.terminated_at >= a.starts_on)
       and (a.branch_id is null or e.branch_id = a.branch_id)
       and (a.department_id is null or e.department_id = a.department_id or (a.include_sub_departments and e.department_id in (select app.hr_department_tree(a.department_id))))
       and not app.manual_att_is_contractor(e.id);
    out := out || jsonb_build_array(jsonb_build_object('id', a.id, 'portal', a.portal, 'portal_label', app.manual_att_portal_label(a.portal), 'status', a.status,
      'branch_id', a.branch_id, 'department_id', a.department_id, 'include_sub_departments', a.include_sub_departments,
      'scope_label', app.manual_att_scope_label(a.branch_id, a.department_id, a.include_sub_departments),
      'starts_on', a.starts_on, 'ends_on', a.ends_on, 'reason', a.reason, 'activated_by_name', app.user_display_name(a.activated_by), 'activated_at', a.activated_at,
      'ended_by_name', case when a.ended_by is null then null else app.user_display_name(a.ended_by) end, 'ended_at', a.ended_at, 'end_note', a.end_note,
      'employees', v_emp, 'entries', v_entries, 'pending_days', v_pending, 'pending_dates', v_dates));
  end loop;
  return out;
end$$;

-- ③ كشف اليوم: «excluded.no_pin» لم تعد تعني «خارج الكشف» — يُضاف «included_no_pin» صريحاً
do $patch$
declare def text; changed text; anchor text; af regprocedure := 'public.manual_att_sheet_get(uuid,date)'::regprocedure;
begin
  def := pg_get_functiondef(af);

  -- ٣-أ عدّاد بلا بصمة يستثني المتعهدين (لهم عدّادهم المستقل)
  anchor := $a$select count(*) filter (where e.biometric_pin is null), count(*) filter (where e.biometric_pin is not null and app.manual_att_is_contractor(e.id))$a$;
  if (length(def) - length(replace(def, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'ATT_NO_PIN_PATCH: تعذّر تحديد عدّاد بلا بصمة في manual_att_sheet_get';
  end if;
  changed := replace(def, anchor,
    $r$select count(*) filter (where e.biometric_pin is null and not app.manual_att_is_contractor(e.id)), count(*) filter (where app.manual_att_is_contractor(e.id))$r$);

  -- ٣-ب المفتاح المستبعد → 0، وإضافة المفتاح الصريح للمشمولين بلا بصمة
  anchor := $a$'excluded', jsonb_build_object('no_pin', coalesce(v_nopin, 0), 'contractors', coalesce(v_contr, 0))$a$;
  if (length(changed) - length(replace(changed, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'ATT_NO_PIN_PATCH: تعذّر تحديد مفتاح excluded في manual_att_sheet_get';
  end if;
  changed := replace(changed, anchor,
    $r$'excluded', jsonb_build_object('no_pin', 0, 'contractors', coalesce(v_contr, 0)), 'included_no_pin', coalesce(v_nopin, 0)$r$);

  execute changed;
end $patch$;

-- ④ إعادة تثبيت الصلاحيات (create or replace يحفظها، وهذا تصريح صريح لا تغيير)
revoke all on function public.attendance_manual_scope_preview(uuid, uuid, boolean), public.attendance_manual_list(boolean) from public, anon;
grant execute on function public.attendance_manual_scope_preview(uuid, uuid, boolean), public.attendance_manual_list(boolean) to authenticated;
