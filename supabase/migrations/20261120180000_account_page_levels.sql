-- 20261120180000_account_page_levels.sql — صلاحيات الصفحات لكل حساب بثلاثة مستويات (الجولة ٦)
--
-- المتطلب ⑨: صلاحية لكل **حساب** (لا لكل دور) بثلاثة مستويات، منفّذة في الخادم وفي الـ API.
--
-- الفكرة: نظام الصلاحيات القائم (00294/00371) يجيب سؤالاً ثنائياً: هل يملك المستخدم الإجراء على
-- الوحدة؟ نضيف طبقة **سقف** فوق الإجابة نفسها، بحيث لا نحتاج لمس أي دالة كتابة موجودة:
--   · جدول public.account_page_levels (user, unit) → 'full' | 'create' | 'view'.
--   · app.can() تُغلف المنطق القديم (app.can_base) ثم تُخفّض النتيجة حسب السقف.
--   · كل دوال الكتابة المربوطة تنادي app.require_can ⇒ app.can ⇒ السقف يُطبَّق تلقائياً
--     في الخادم قبل أي أثر، وmy_permissions() (التي تبني الواجهة) تعكس السقف فوراً.
--
-- خرائط الإجراء إلى السقف:
--   view, export               → يحتاج 'view'  (الثلاثة تكفي)
--   create                     → يحتاج 'create' أو 'full'
--   edit, decide, execute, delete → يحتاج 'full'
--
-- استثناء معلن: حسابات it_admin لا يقيّدها السقف (هي التي تضبطه، وقيّدها يعني إغلاق الإدارة
-- على نفسها). كل تعديل سقف يُدوَّن في permission_audit.
--
-- التراجع: إسقاط app.can (وإعادة 00371) + إسقاط الجدول والدوال الثلاث.

-- ⓪ فحص مسبق
do $pre$
begin
  if to_regprocedure('app.can(uuid,text,text)') is null then
    raise exception 'LEVELS_PRECHECK: محرك الصلاحيات غير موجود — نفّذ 00294/00371 أولاً';
  end if;
  if to_regprocedure('app.require_it_admin(text)') is null then
    raise exception 'LEVELS_PRECHECK: نفّذ 20261120120000 أولاً';
  end if;
  if to_regclass('public.permission_units') is null or to_regclass('public.permission_audit') is null then
    raise exception 'LEVELS_PRECHECK: جداول الصلاحيات غير موجودة';
  end if;
end $pre$;

-- ① الجدول
create table if not exists public.account_page_levels (
  user_id    uuid not null references auth.users (id) on delete cascade,
  unit_key   text not null references public.permission_units (key) on delete cascade,
  level      text not null check (level in ('full', 'create', 'view')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, unit_key)
);

comment on table public.account_page_levels is
  'سقف صلاحية الصفحة لكل حساب: full (كامل) · create (إنشاء دون تعديل) · view (عرض فقط). لا يمنح وصولاً؛ يقيّد ما منحه الدور/القالب/التجاوز.';
comment on column public.account_page_levels.level is
  'full = عرض/إنشاء/تعديل · create = عرض وإنشاء بلا تعديل · view = عرض فقط.';

alter table public.account_page_levels enable row level security;
revoke all on table public.account_page_levels from anon, authenticated;

create index if not exists idx_apl_user on public.account_page_levels (user_id);
create index if not exists idx_apl_unit on public.account_page_levels (unit_key);

-- ② محرك السقف
create or replace function app.level_rank(p_level text) returns int
language sql immutable as $$
  select case p_level when 'full' then 3 when 'create' then 2 when 'view' then 1 else 0 end
$$;
revoke all on function app.level_rank(text) from public, anon, authenticated;

/** السقف المخزَّن للحساب على الوحدة (افتراضياً full — القيد يأتي من الدور نفسه) */
create or replace function app.account_level(p_user uuid, p_unit text) returns text
language sql stable security definer set search_path = public, app as $$
  select coalesce(
    (select level from public.account_page_levels where user_id = p_user and unit_key = p_unit),
    'full')
$$;
revoke all on function app.account_level(uuid, text) from public, anon, authenticated;

/** الإجراء المطلوب لهذا السقف */
create or replace function app.action_level(p_action text) returns text
language sql immutable as $$
  select case
    when p_action in ('view', 'export') then 'view'
    when p_action = 'create' then 'create'
    else 'full'
  end
$$;
revoke all on function app.action_level(text) from public, anon, authenticated;

/** هل السقف يسمح بهذا الإجراء؟ */
create or replace function app.level_permits(p_user uuid, p_unit text, p_action text) returns boolean
language sql stable security definer set search_path = public, app as $$
  select app.level_rank(app.account_level(p_user, p_unit)) >= app.level_rank(app.action_level(p_action))
$$;
revoke all on function app.level_permits(uuid, text, text) from public, anon, authenticated;

-- ③ المحرك القديم كما هو (نسخة 00371 حرفياً) باسم app.can_base
create or replace function app.can_base(p_user uuid, p_unit text, p_action text) returns boolean
language plpgsql stable security definer set search_path = public, app as $$
declare u public.permission_units; eff text; r text;
begin
  if p_user is null then return false; end if;
  select * into u from public.permission_units where key = p_unit;
  if u.key is null then return false; end if;
  if not (p_action = any(u.actions)) then return false; end if;
  if exists (select 1 from public.user_roles where user_id = p_user and role = 'it_admin') then return true; end if;
  select role into r from public.permission_portal_roles where portal = u.portal;
  if p_action = 'view' and u.parent_key is null and u.path = '/' || u.portal
     and exists (select 1 from public.user_roles where user_id = p_user and role = r) then return true; end if;
  select effect into eff from public.user_permission_overrides where user_id = p_user and unit_key = p_unit and action = p_action;
  if eff is not null then return eff = 'allow'; end if;
  select tr.effect into eff from public.user_permission_template ut
    join public.permission_templates t on t.id = ut.template_id and t.is_active
    join public.permission_template_rules tr on tr.template_id = t.id and tr.unit_key = p_unit and tr.action = p_action
   where ut.user_id = p_user;
  if eff is not null then return eff = 'allow'; end if;
  return exists (select 1 from public.user_roles where user_id = p_user and role = r);
end$$;
revoke all on function app.can_base(uuid, text, text) from public, anon, authenticated;

/** الدالة الحاكمة — القرار النهائي لكل شيء: الأساس ثم السقف */
create or replace function app.can(p_user uuid, p_unit text, p_action text) returns boolean
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not app.can_base(p_user, p_unit, p_action) then
    return false;
  end if;
  -- IT لا يقيّدها السقف (هي مصدر الضبط؛ ولا تُقفل الإدارة على نفسها)
  if exists (select 1 from public.user_roles where user_id = p_user and role = 'it_admin') then
    return true;
  end if;
  return app.level_permits(p_user, p_unit, p_action);
end$$;
revoke all on function app.can(uuid, text, text) from public, anon, authenticated;

/** للخادم: يرفع PERMISSION_DENIED إن لم يملك المستخدم الإجراء (لم يتغير — يعتمد app.can) */
create or replace function app.require_can(p_unit text, p_action text) returns void
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not app.can(auth.uid(), p_unit, p_action) then
    raise exception 'PERMISSION_DENIED' using detail = p_unit || ':' || p_action;
  end if;
end$$;
revoke all on function app.require_can(text, text) from public, anon, authenticated;

-- ④ واجهات القراءة
/** للواجهة: سقفي على كل وحدة أراها {unit_key: level} — للعرض وتنقية الأزرار */
create or replace function public.my_unit_levels() returns jsonb
language sql stable security definer set search_path = public, app as $$
  select coalesce(jsonb_object_agg(u.key, app.account_level(auth.uid(), u.key) order by u.key), '{}'::jsonb)
  from public.permission_units u
  where app.can(auth.uid(), u.key, 'view')
$$;
revoke all on function public.my_unit_levels() from public, anon;
grant execute on function public.my_unit_levels() to authenticated;

/** لتقنية المعلومات: حالة كل وحدة لحساب مستهدف */
create or replace function public.it_account_levels(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare v_out jsonb;
begin
  perform app.require_it_admin('view');
  if not exists (select 1 from auth.users where id = p_user) then
    raise exception 'IT_USER_NOT_FOUND';
  end if;
  select jsonb_agg(jsonb_build_object(
           'unit_key', u.key,
           'portal', u.portal,
           'label', u.label,
           'accessible', app.can_base(p_user, u.key, 'view'),
           'stored', l.level,
           'effective', app.account_level(p_user, u.key)
         ) order by u.sort, u.key)
    into v_out
    from public.permission_units u
    left join public.account_page_levels l on l.user_id = p_user and l.unit_key = u.key;
  return coalesce(v_out, '[]'::jsonb);
end$$;
revoke all on function public.it_account_levels(uuid) from public, anon;
grant execute on function public.it_account_levels(uuid) to authenticated;

-- ⑤ واجهات الضبط (IT فقط + تدقيق)
create or replace function public.it_account_level_set(p_user uuid, p_unit text, p_level text) returns void
language plpgsql security definer set search_path = public, app as $$
declare v_old text;
begin
  perform app.require_it_admin('edit');
  if p_level not in ('full', 'create', 'view') then
    raise exception 'INVALID_INPUT' using detail = 'level';
  end if;
  if not exists (select 1 from auth.users where id = p_user) then
    raise exception 'IT_USER_NOT_FOUND';
  end if;
  if not exists (select 1 from public.permission_units where key = p_unit) then
    raise exception 'INVALID_INPUT' using detail = 'unit';
  end if;

  select level into v_old from public.account_page_levels where user_id = p_user and unit_key = p_unit;

  insert into public.account_page_levels (user_id, unit_key, level, created_by, updated_at)
  values (p_user, p_unit, p_level, auth.uid(), now())
  on conflict (user_id, unit_key) do update
    set level = excluded.level, updated_at = now();

  perform app.perm_audit(p_user, null, 'level_set',
    jsonb_build_object('unit', p_unit, 'from', v_old, 'to', p_level));
end$$;
revoke all on function public.it_account_level_set(uuid, text, text) from public, anon;
grant execute on function public.it_account_level_set(uuid, text, text) to authenticated;

create or replace function public.it_account_level_clear(p_user uuid, p_unit text) returns void
language plpgsql security definer set search_path = public, app as $$
begin
  perform app.require_it_admin('edit');
  delete from public.account_page_levels where user_id = p_user and unit_key = p_unit;
  perform app.perm_audit(p_user, null, 'level_clear', jsonb_build_object('unit', p_unit));
end$$;
revoke all on function public.it_account_level_clear(uuid, text) from public, anon;
grant execute on function public.it_account_level_clear(uuid, text) to authenticated;

-- ⑥ فحص ذاتي
do $check$
declare v_units int; v_it uuid := gen_random_uuid(); v_emp uuid := gen_random_uuid();
begin
  select count(*) into v_units from public.permission_units;
  if v_units < 100 then
    raise exception 'LEVELS_CHECK: كتالوج الوحدات ناقص (%)', v_units;
  end if;
  if app.level_rank('full') <= app.level_rank('create') or app.level_rank('create') <= app.level_rank('view') then
    raise exception 'LEVELS_CHECK: ترتيب المستويات غير صحيح';
  end if;
  if app.action_level('edit') <> 'full' or app.action_level('create') <> 'create' or app.action_level('view') <> 'view' then
    raise exception 'LEVELS_CHECK: خريطة الإجراءات غير صحيحة';
  end if;
  if app.level_permits(v_emp, 'hr.employees', 'edit') is not true then
    raise exception 'LEVELS_CHECK: بلا سقف مخزَّن يجب أن يكون full';
  end if;
  perform app.require_it_admin('view');
exception when others then
  if sqlerrm not like '%PERMISSION_DENIED%' then raise; end if;
end $check$;
