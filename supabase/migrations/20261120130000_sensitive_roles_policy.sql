-- 20261120130000 — الأدوار الحساسة صارت جدولاً قابلاً للتعديل (الجولة ٢ من خطة الصلاحيات والأمان)
--
-- ما تفعله هذه الترحيلة:
--   ① جدول public.sensitive_roles — القائمة المرجعية الوحيدة للأدوار التسعة الحساسة:
--      super_admin · executive_director · deputy_director · finance_officer · admin_ops ·
--      field_ops · it_admin · ops_room_manager · ops_room
--      قابل للتعديل من بوابة تقنية المعلومات (تفعيل/تعطيل + سبب) بلا ترحيل جديد.
--      الزرع لا يدهس تعديلاً سابقاً (on conflict do nothing).
--   ② app.is_sensitive_role(p_role) — الحارس الموحّد الذي يقرأ الجدول (بدل المصفوفة المثبّتة في الكود).
--   ③ public.sensitive_roles_list() — قراءة للواجهة مع عدد حاملي كل دور.
--   ④ public.sensitive_role_set(role, active, reason) — تفعيل/تعطيل بدور it_admin + تدقيق إلزامي.
--      استثناء مقصود: لا يمكن تعطيل حماية it_admin أو super_admin (أرضية أمان).
--   ⑤ ترقيع محروس لدالة app.set_user_role:
--      (أ) الأدوار الأربعة المثبّتة ⇒ app.is_sensitive_role(p_role) (الجدول هو المرجع).
--      (ب) **المستخدم العادي لا يطلب دوراً حسّاساً إطلاقاً** — ولو عبر مسار الموافقات
--          (ROLE_SENSITIVE_FORBIDDEN)، قبل إنشاء أي طلب. المسار متاح لتقنية المعلومات
--          والمدير المفوض فقط، والاعتماد يبقى للمدير المفوض كما هو.
--
-- ما لا تغيّره: لا محرك موافقات جديد، لا تعديل في role_grant_decide، لا تغيير في الأدوار
-- الممنوحة حالياً (22 صفاً)، ولا في سلوك المسارات القائمة للأدوار غير الحساسة.
-- التراجع: إعادة نص app.set_user_role من 20261110180000، ثم drop الجدول والدوال الثلاث.

-- ⓪ فحص مسبق: كل ما نعتمد عليه موجود
do $pre$
begin
  if to_regclass('public.user_roles') is null or to_regclass('public.role_grant_requests') is null then
    raise exception 'SENSITIVE_ROLES_PRECHECK: جداول الأدوار غير موجودة — نفّذ 20261110180000 أولاً';
  end if;
  if to_regprocedure('app.set_user_role(uuid,text,boolean,uuid)') is null then
    raise exception 'SENSITIVE_ROLES_PRECHECK: app.set_user_role غير موجودة';
  end if;
  if pg_get_functiondef('app.set_user_role(uuid,text,boolean,uuid)'::regprocedure)
       not like '%''it_admin'', ''super_admin'', ''finance_officer'', ''deputy_director''%' then
    raise exception 'SENSITIVE_ROLES_PRECHECK: نص app.set_user_role لا يطابق المتوقع (ربما عُدّل سابقاً)';
  end if;
end $pre$;

-- ① جدول الأدوار الحساسة
create table if not exists public.sensitive_roles (
  role       text primary key,
  label      text not null,
  reason     text,
  active     boolean not null default true,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.sensitive_roles is
  'الأدوار التي لا تُمنح/تُسحب إلا عبر طلب موافقة، ولا يطلبها إلا تقنية المعلومات أو المدير المفوض. قابلة للتفعيل/التعطيل من بوابة IT.';

alter table public.sensitive_roles enable row level security;
revoke all on table public.sensitive_roles from anon, authenticated;

insert into public.sensitive_roles (role, label, reason) values
  ('super_admin',       'مدير مفوض',              'يرى كل بيانات الشركة — لا يُمنح بطلب عادي'),
  ('executive_director', 'مدير تنفيذي',            'سلطة تنفيذية عليا'),
  ('deputy_director',   'معاون المدير المفوض',     'سلطة تنفيذية — بوابة مستقلة'),
  ('finance_officer',   'مالية',                   'وصول كامل للرواتب والصرف'),
  ('admin_ops',         'مسؤول القاطع',            'سلطة على قاطع كامل'),
  ('field_ops',         'عمليات ميدانية',          'تحكم ميداني وتشغيلي'),
  ('it_admin',          'تقنية معلومات',           'سلطة تقنية عليا — إدارة الحسابات والصلاحيات'),
  ('ops_room_manager',  'مدير غرفة العمليات',      'إدارة غرفة العمليات'),
  ('ops_room',          'غرفة عمليات',             'تشغيل مركز الشركة')
on conflict (role) do nothing;

-- ② الحارس الموحّد: يقرأ الجدول (المعطَّل لا يُعدّ حساساً)
create or replace function app.is_sensitive_role(p_role text) returns boolean
language sql stable security definer set search_path = public, app as $$
  select coalesce((select sr.active from public.sensitive_roles sr where sr.role = p_role), false)
$$;
revoke all on function app.is_sensitive_role(text) from public, anon, authenticated;

-- ③ قراءة القائمة للواجهة
create or replace function public.sensitive_roles_list()
returns table (
  role       text,
  label      text,
  reason     text,
  active     boolean,
  holders    int,
  updated_at timestamptz
)
language plpgsql stable security definer set search_path = public, app as $$
begin
  perform app.require_can('it.user-management.list', 'view');
  return query
    select sr.role, sr.label, sr.reason, sr.active,
           (select count(*)::int from public.user_roles ur where ur.role = sr.role),
           sr.updated_at
    from public.sensitive_roles sr
    order by sr.active desc, sr.label;
end $$;
revoke all on function public.sensitive_roles_list() from public, anon;
grant execute on function public.sensitive_roles_list() to authenticated;

-- ④ تفعيل/تعطيل — تقنية المعلومات فقط + تدقيق
create or replace function public.sensitive_role_set(p_role text, p_active boolean, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare v_old public.sensitive_roles;
begin
  perform app.require_it_admin('edit');
  if p_active is null then
    raise exception 'INVALID_INPUT' using detail = 'p_active مطلوب';
  end if;
  select * into v_old from public.sensitive_roles sr where sr.role = p_role for update;
  if v_old.role is null then
    raise exception 'ROLE_INVALID' using detail = p_role;
  end if;
  if p_reason is not null and char_length(p_reason) > 500 then
    raise exception 'INVALID_INPUT' using detail = 'السبب أطول من 500 حرف';
  end if;
  -- أرضية أمان: الدوران الأعلى سلطة يبقيان محميّين دائماً
  if not p_active and p_role in ('it_admin', 'super_admin') then
    raise exception 'ROLE_LOCKED' using detail = 'لا يمكن تعطيل حماية ' || p_role;
  end if;
  if v_old.active = p_active then
    return jsonb_build_object('role', p_role, 'active', p_active, 'changed', false);
  end if;

  update public.sensitive_roles
     set active = p_active,
         reason = coalesce(nullif(btrim(coalesce(p_reason, '')), ''), reason),
         updated_by = auth.uid(),
         updated_at = now()
   where role = p_role;

  insert into public.audit_logs (table_name, record_id, operation, new_row, actor_id, actor_role)
  values ('sensitive_roles', p_role, 'UPDATE',
          jsonb_build_object('role', p_role, 'active', p_active, 'before', v_old.active,
                             'reason', nullif(btrim(coalesce(p_reason, '')), '')),
          auth.uid(), app.current_role());

  return jsonb_build_object('role', p_role, 'active', p_active, 'changed', true);
end $$;
revoke all on function public.sensitive_role_set(text, boolean, text) from public, anon;
grant execute on function public.sensitive_role_set(text, boolean, text) to authenticated;

-- ⑤ ترقيع محروس لدالة المنح: الجدول بدل المصفوفة + منع المستخدم العادي من طلب دور حسّاس
do $patch$
declare
  v_def text;
  v_anchor text := '  -- V-36: الأدوار الحساسة لا تُمنح/تُسحب إلا بموافقة المدير المفوض' || chr(10) ||
                   '  if p_role in (''it_admin'', ''super_admin'', ''finance_officer'', ''deputy_director'')';
  v_new text := '  -- V-37 (الجولة ٢): الأدوار الحساسة تأتي من جدول sensitive_roles القابل للتعديل' || chr(10) ||
                '  -- المستخدم العادي لا يطلب دوراً حسّاساً إطلاقاً — ولو بمسار موافقات' || chr(10) ||
                '  if app.is_sensitive_role(p_role)' || chr(10) ||
                '     and coalesce(current_setting(''app.role_grant_approved'', true), '''') <> ''on''' || chr(10) ||
                '     and not exists (select 1 from public.user_roles ur3 where ur3.user_id = v_actor' || chr(10) ||
                '                      and ur3.role in (''it_admin'', ''super_admin'')) then' || chr(10) ||
                '    raise exception ''ROLE_SENSITIVE_FORBIDDEN: الأدوار الحساسة لا تطلبها إلا تقنية المعلومات'';' || chr(10) ||
                '  end if;' || chr(10) ||
                '  if app.is_sensitive_role(p_role)';
begin
  v_def := pg_get_functiondef('app.set_user_role(uuid,text,boolean,uuid)'::regprocedure);
  if position('app.is_sensitive_role(p_role)' in v_def) > 0 then
    raise notice 'SENSITIVE_ROLES: الترقيع مطبَّق سابقاً';
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) <> length(v_anchor) then
    raise exception 'SENSITIVE_ROLES_PRECHECK: مرساة الترقيع غير موجودة مرة واحدة بالضبط';
  end if;
  v_def := replace(v_def, v_anchor, v_new);
  execute v_def;
end $patch$;

-- ⑥ فحص ذاتي: التسعة موجودة ونشطة، والحارس يقرأ الجدول، والمنع الناعم مطبَّق
do $check$
declare v_active int; v_total int;
begin
  select count(*) filter (where active), count(*) into v_active, v_total from public.sensitive_roles;
  if v_total < 9 then
    raise exception 'SENSITIVE_ROLES_CHECK: يجب أن تحوي القائمة الأدوار التسعة، جاء %', v_total;
  end if;
  if v_active < 9 then
    raise exception 'SENSITIVE_ROLES_CHECK: كل الأدوار التسعة مفعّلة بعد الزرع، النشط = %', v_active;
  end if;
  if not app.is_sensitive_role('it_admin') or not app.is_sensitive_role('ops_room') then
    raise exception 'SENSITIVE_ROLES_CHECK: الحارس لا يقرأ الجدول';
  end if;
  if app.is_sensitive_role('employee') or app.is_sensitive_role(null) then
    raise exception 'SENSITIVE_ROLES_CHECK: حارس مفرط — دور غير حساس عُدّ حسّاساً';
  end if;
  if pg_get_functiondef('app.set_user_role(uuid,text,boolean,uuid)'::regprocedure) like '%''finance_officer'', ''deputy_director'')%' then
    raise exception 'SENSITIVE_ROLES_CHECK: ما زالت المصفوفة المثبّتة في نص الدالة';
  end if;
end $check$;
