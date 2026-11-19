-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- الحضور اليدوي البديل عند تعطل جهاز البصمة — «كشف حضور» لكل بوابة، لا يفعّله أو يوقفه إلا دور it_admin
--
-- الفكرة (قرارات المالك، ست إجابات):
--   ١) النطاق: يختاره المُفعِّل من الهيكل التنظيمي (فرع و/أو قسم مع أقسامه الفرعية).
--   ٢) التفعيل والإيقاف: بوابة التطوير المركزية (تقنية المعلومات) فقط، وآلية عامة تصلح لأي بوابة.
--   ٣) الكشف المحفوظ يسري فوراً؛ اليوم بلا كشف «بانتظار الكشف» (لا غياب ولا خصم) ويمنع اعتماد حضورية الشهر حتى يكتمل.
--   ٤) إيقاف منطقي: الكشف هو المصدر الوحيد لموظفي النطاق في أيام التفعيل؛ البصمات الواردة تُخزَّن كما هي ولا تؤثر،
--      ولا يُمسّ الجهاز ولا تسجيل الموظفين عليه، وتعود البصمة بالإيقاف (كل يوم يتبع مصدراً واحداً بالكامل).
--   ٥) المتعهدون في نطاق موقوف يُدفعون من الأعداد التي يرسلونها مباشرة (بلا قاعدة بصمة ولا استقطاع). الإجازة المعتمدة لا تُمسّ.
--   ٦) كل ما سبق مدقَّق: من فعّل ومتى ولماذا، ومن سجّل الكشف وما غيّره.
--
-- ما تضيفه هذه الترحيلة:
--   ① جدولان: attendance_manual_activations (التفعيلات) وattendance_manual_entries (مدخلات الكشف: من/متى/أي تفعيل).
--   ② دوال مساعدة في app: النطاق، «بانتظار الكشف»، صفوف الكشف، خطة اليوم من الشفت.
--   ③ ثلاث دوال كتابة بأغلفة الحماية (guard_duplicate + قفل السجل): تفعيل، إيقاف، حفظ الكشف.
--      وقراءات: كشف يوم، تفعيلاتي (للقائمة الجانبية)، قائمة تقنية المعلومات، معاينة النطاق، عدّادات الشهر، ملخص المعلّق.
--   ④ ثلاثة تعديلات على الموجود (كلها بنص معدَّل حرفياً وبحارس «مرة واحدة بالضبط»):
--      · app.hr_evaluate_day_00350_base: يوم موظف في نطاق مفعَّل بلا كشف لا يُنتج صفاً تلقائياً (لا غياب تلقائي).
--      · app.ops_attendance_confirm__raw: يمنع الاعتماد برسالة صريحة ما دام هناك أيام بانتظار الكشف.
--      · app.contractor_wage_days / app.contractor_wages_state: أيام المتعهد في نطاق موقوف تُدفع من العدد المرسَل.
--   ⑤ إشعارات التفعيل/الإيقاف وتذكير يومي بالكشوف الناقصة (pg_cron إن وُجد)، وتسجيل الجدولين في كتالوجي الاحتفاظ والتصفير.
--
-- لا تغيير في: جهاز البصمة، جدول البصمات، قواعد الاستقطاع، سياسة الإجازات، كشف الرواتب. الصفوف اليدوية الحالية لا تُمسّ.
-- الأمان: كل الدوال security definer بمسار بحث ثابت؛ الجدولان بلا سياسات (لا قراءة/كتابة مباشرة) والوصول عبر الدوال فقط.
-- التراجع (قبل أي تفعيل): drop الدوال الجديدة والجدولين، وإعادة نص الدوال الأربع المعدَّلة من 00350/00193/20261117150000 (الفروق مذكورة أدناه).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- ⓪ فحص مسبق: كل ما نعتمد عليه موجود (وإلا تتوقف الترحيلة كلها قبل أي تغيير)
do $pre$
declare v text;
begin
  foreach v in array array[
    'app.hr_evaluate_day_00350_base(uuid,date)', 'app.ops_attendance_confirm__raw(date)', 'app.contractor_wage_days(date,uuid)', 'app.contractor_wages_state(date)',
    'app.hr_evaluate_day(uuid,date)', 'app.hr_month_locked(date)', 'app.hr_month_confirmed(date)', 'app.hr_effective_shift(uuid,date)', 'app.hr_department_tree(uuid)',
    'app.hr_payroll_lock_range(date,date)', 'app.hr_notify(uuid,text,text,text,text,text)', 'app.guard_duplicate(text,jsonb)', 'app.guard_record_lock(uuid)',
    'app.user_display_name(uuid)', 'app.can(uuid,text,text)', 'app.require_can(text,text)', 'app.has_role(text[])', 'app.hr_policy_int(text,integer)',
    'app.hr_refresh_alerts(uuid,date)', 'app.hr_local_date(timestamp with time zone)', 'app.hr_tz()', 'app.audit_trigger()'
  ] loop
    if to_regprocedure(v) is null then raise exception 'ATT_MANUAL_PRECHECK: الدالة % غير موجودة — نفّذ الترحيلات السابقة أولاً', v; end if;
  end loop;
  if to_regclass('public.hr_attendance_days') is null or to_regclass('public.hr_attendance_audit') is null or to_regclass('public.contractor_profiles') is null then
    raise exception 'ATT_MANUAL_PRECHECK: جداول الحضور أو المتعهدين غير موجودة';
  end if;
end $pre$;

-- ① الجداول ──────────────────────────────────────────────────────────────────────────────────
create table if not exists public.attendance_manual_activations (
  id                      uuid primary key default gen_random_uuid(),
  portal                  text not null,                                   -- البوابة التي تُضاف إليها صفحة الكشف
  branch_id               uuid references public.branches(id),
  department_id           uuid references public.departments(id),
  include_sub_departments boolean not null default true,                   -- القسم مع أقسامه الفرعية
  starts_on               date not null,                                   -- أول يوم يغطيه الكشف
  ends_on                 date,                                            -- آخر يوم يغطيه الكشف (فارغ = ما زال ساريًا)
  status                  text not null default 'active' check (status in ('active', 'ended')),
  reason                  text not null check (length(btrim(reason)) >= 3),
  activated_by            uuid references auth.users(id) on delete set null,
  activated_at            timestamptz not null default now(),
  ended_by                uuid references auth.users(id) on delete set null,
  ended_at                timestamptz,
  end_note                text,
  constraint attendance_manual_scope_chk check (branch_id is not null or department_id is not null),
  constraint attendance_manual_state_chk check (
    (status = 'active' and ends_on is null and ended_at is null)
    or (status = 'ended' and ends_on is not null and ended_at is not null)),
  constraint attendance_manual_range_chk check (ends_on is null or ends_on >= starts_on - 1)
);
-- تفعيل ساريان لبوابة ونطاق متطابقين ممنوعان على مستوى القاعدة (سباق نقرتين)
create unique index if not exists attendance_manual_active_scope_uq on public.attendance_manual_activations
  (portal, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid), include_sub_departments)
  where status = 'active';
create index if not exists attendance_manual_activations_state_idx on public.attendance_manual_activations (status, starts_on);

create table if not exists public.attendance_manual_entries (
  employee_id   uuid not null references public.employees(id) on delete cascade,
  work_date     date not null,
  activation_id uuid not null references public.attendance_manual_activations(id),
  portal        text not null,
  status        text not null check (status in ('present', 'absent')),
  note          text,
  entered_by    uuid references auth.users(id) on delete set null,
  entered_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id) on delete set null,
  updated_at    timestamptz not null default now(),
  revision      int not null default 1,
  primary key (employee_id, work_date)
);
create index if not exists attendance_manual_entries_act_idx on public.attendance_manual_entries (activation_id, work_date);

alter table public.attendance_manual_activations enable row level security;
alter table public.attendance_manual_entries enable row level security;
revoke all on table public.attendance_manual_activations, public.attendance_manual_entries from anon, authenticated;

drop trigger if exists trg_audit_attendance_manual_activations on public.attendance_manual_activations;
create trigger trg_audit_attendance_manual_activations after insert or update or delete on public.attendance_manual_activations
  for each row execute function app.audit_trigger();

-- ② دوال مساعدة (app) ───────────────────────────────────────────────────────────────────────
create or replace function app.manual_att_portal_label(p_portal text) returns text language sql immutable as $$
  select coalesce((array[
    ['hr', 'الموارد البشرية'], ['manager', 'مسؤول قسم'], ['finance', 'الشؤون المالية'], ['it', 'التطوير المركزية'], ['admin', 'مدير مفوض'],
    ['field-ops', 'العمليات الميدانية'], ['admin-ops', 'مسؤول القاطع'], ['maintenance', 'الصيانة'], ['transfer-station', 'المحطة التحويلية'],
    ['executive', 'المدير التنفيذي'], ['deputy', 'معاون المدير المفوض'], ['ops-room', 'غرفة العمليات'], ['ops-room-manager', 'مدير غرفة العمليات'],
    ['complaints', 'بوابة الشكاوى'], ['media', 'بوابة الإعلام'], ['central-garage', 'بوابة الكراج المركزي'], ['follow-up', 'بوابة المتابعة']
  ])[array_position((array['hr','manager','finance','it','admin','field-ops','admin-ops','maintenance','transfer-station','executive','deputy','ops-room','ops-room-manager','complaints','media','central-garage','follow-up']), p_portal)][2], p_portal)
$$;

-- نص نطاق التفعيل للعرض والإشعارات
create or replace function app.manual_att_scope_label(p_branch uuid, p_department uuid, p_include boolean) returns text language sql stable security definer set search_path = public, app as $$
  select concat_ws(' · ',
    (select 'فرع ' || b.name from public.branches b where b.id = p_branch),
    (select 'قسم ' || d.name || case when p_include then ' وما تحته' else '' end from public.departments d where d.id = p_department))
$$;

-- الموظف متعهد فعّال (يُدفع من الأعداد لا من البصمة): لا يدخل الكشف ولا «بانتظار الكشف»
create or replace function app.manual_att_is_contractor(p_employee uuid) returns boolean language sql stable security definer set search_path = public, app as $$
  select exists (select 1 from public.employees e join public.contractor_profiles cp on cp.user_id = e.user_id and cp.is_active where e.id = p_employee)
$$;

-- هل يقع الموظف في نطاق تفعيل ساريٍ في هذا اليوم؟ (الفرع و/أو القسم؛ المتعهد يُحتسب هنا ويُستثنى في blocks_auto)
create or replace function app.manual_att_in_scope(p_employee uuid, p_date date, p_activation uuid default null) returns boolean language sql stable security definer set search_path = public, app as $$
  select exists (
    select 1
      from public.attendance_manual_activations a
      join public.employees e on e.id = p_employee
     where (p_activation is null or a.id = p_activation)
       and a.starts_on <= p_date and (a.ends_on is null or p_date <= a.ends_on)
       and (a.branch_id is null or e.branch_id = a.branch_id)
       and (a.department_id is null or e.department_id = a.department_id
            or (a.include_sub_departments and e.department_id in (select app.hr_department_tree(a.department_id)))))
$$;

-- نطاق موقوف البصمة لأجور المتعهد (يشمل المتعهد نفسه): تُدفع أيامه من العدد المرسَل
create or replace function app.manual_att_stopped(p_employee uuid, p_date date) returns boolean language sql stable security definer set search_path = public, app as $$
  select p_employee is not null and app.manual_att_in_scope(p_employee, p_date)
$$;

-- يمنع المحرّك من إنتاج صف تلقائي لهذا الموظف/اليوم: نطاق مفعَّل، ليس متعهداً، وبلا إجازة معتمدة (الإجازة تبقى كما هي)
create or replace function app.manual_att_blocks_auto(p_employee uuid, p_date date) returns boolean language sql stable security definer set search_path = public, app as $$
  select app.manual_att_in_scope(p_employee, p_date)
     and not app.manual_att_is_contractor(p_employee)
     and not exists (select 1 from public.hr_leaves l where l.employee_id = p_employee and l.status = 'approved' and l.kind = 'leave' and p_date between l.start_date and l.end_date)
$$;

-- من يسجّل الكشف: صاحب صلاحية «إنشاء» في وحدة بوابة التفعيل، أو المستوى الأعلى (غرفة العمليات والمدير المفوض)
create or replace function app.manual_att_can_record(p_portal text) returns boolean language sql stable security definer set search_path = public, app as $$
  select auth.uid() is not null and (app.can(auth.uid(), p_portal || '.manual-attendance', 'create') or app.has_role(array['ops_room', 'super_admin']))
$$;

-- مراجعة صف حضور يدوي قديم لا يقابله إدخال كشف: لا يتجاوز القفل إلا موظف موارد بشرية أو غرفة العمليات أو IT/المدير المفوض.
create or replace function app.manual_att_can_review() returns boolean language sql stable security definer set search_path = public, app as $$
  select auth.uid() is not null and app.has_role(array['ops_room', 'hr_officer', 'it_admin', 'super_admin'])
$$;

-- مستوى أعلى يتجاوز نافذة الأيام السابقة (ضمن شهر غير مقفل/معتمد): لإنهاء الأيام العالقة
create or replace function app.manual_att_is_senior() returns boolean language sql stable security definer set search_path = public, app as $$
  select app.has_role(array['ops_room', 'super_admin', 'it_admin'])
$$;

-- خطة اليوم من الشفت الفعلي (كما يحسبها المحرّك): أوقات متوقعة وعدد الدقائق؛ بلا شفت = بلا أوقات (لا أثر مالي)
create or replace function app.manual_att_day_plan(p_employee uuid, p_date date)
returns table (has_shift boolean, scheduled boolean, shift_name text, exp_in timestamptz, exp_out timestamptz, required_minutes int)
language plpgsql stable security definer set search_path = public, app as $$
declare sh record; tz interval := app.hr_tz(); v_in timestamptz; v_out timestamptz;
begin
  select * into sh from app.hr_effective_shift(p_employee, p_date);
  if sh.shift_id is null then
    return query select false, true, null::text, null::timestamptz, null::timestamptz, 0;
    return;
  end if;
  v_in := ((p_date + sh.start_time)::timestamp - tz) at time zone 'UTC';
  v_out := ((p_date + sh.end_time)::timestamp - tz) at time zone 'UTC';
  if v_out <= v_in then v_out := v_out + interval '1 day'; end if;
  -- الشفت المرن: الانتهاء = البداية + الساعات المطلوبة (كما في تصحيح البصمة بلا بصمة)
  if coalesce(sh.kind, 'fixed') = 'flexible' then v_out := v_in + make_interval(mins => round(coalesce(sh.required_hours, 0) * 60)::int); end if;
  return query select true, extract(dow from p_date)::int::smallint = any (sh.work_days), sh.shift_name, v_in, v_out, floor(extract(epoch from (v_out - v_in)) / 60)::int;
end$$;

-- موظفو نطاق تفعيل ليوم معيّن مع حالة كل واحد: open (يُدخَل له) | leave | rest | self | other (تعديل يدوي من مسار آخر)
create or replace function app.manual_att_sheet_rows(p_activation uuid, p_date date)
returns table (employee_id uuid, full_name text, employee_number text, job_title text, department_name text, has_shift boolean,
               state text, entry text, entry_note text, entered_by_name text, entered_at timestamptz,
               punch_count int, first_punch timestamptz, last_punch timestamptz, existing_status text, existing_source text)
language sql stable security definer set search_path = public, app as $$
  with a as (select * from public.attendance_manual_activations where id = p_activation),
       lo as (select ((p_date::timestamp - app.hr_tz()) at time zone 'UTC') as t)
  select e.id, e.full_name, e.employee_number, e.job_title, d.name, sh.shift_id is not null,
         case
           when e.user_id is not null and e.user_id = auth.uid() then 'self'
           when exists (select 1 from public.hr_leaves l where l.employee_id = e.id and l.status = 'approved' and l.kind = 'leave' and p_date between l.start_date and l.end_date) then 'leave'
           when sh.shift_id is not null and not (extract(dow from p_date)::int::smallint = any (sh.work_days)) then 'rest'
           when h.source = 'manual' and (en.employee_id is null
                or not ((en.status = 'present' and h.status in ('present', 'time_permit', 'late', 'early_leave', 'incomplete')) or (en.status = 'absent' and h.status = 'absent'))) then 'other'
           else 'open' end,
         case when h.source = 'manual' and en.employee_id is not null then en.status end,
         en.note, case when en.employee_id is not null then app.user_display_name(coalesce(en.updated_by, en.entered_by)) end, en.updated_at,
         pu.n, pu.f, pu.l, h.status, h.source
    from a
    join public.employees e on e.archived_at is null
                           and e.hire_date <= p_date and (e.terminated_at is null or p_date <= e.terminated_at)
                           and (a.branch_id is null or e.branch_id = a.branch_id)
                           and (a.department_id is null or e.department_id = a.department_id
                                or (a.include_sub_departments and e.department_id in (select app.hr_department_tree(a.department_id))))
    left join public.departments d on d.id = e.department_id
    left join lateral app.hr_effective_shift(e.id, p_date) sh on true
    left join public.attendance_manual_entries en on en.employee_id = e.id and en.work_date = p_date
    left join public.hr_attendance_days h on h.employee_id = e.id and h.work_date = p_date
    cross join lo
    left join lateral (select count(distinct bp.punched_at)::int as n, min(bp.punched_at) as f, max(bp.punched_at) as l
                         from public.biometric_punches bp where bp.employee_id = e.id and bp.punched_at >= lo.t and bp.punched_at < lo.t + interval '1 day') pu on true
   where not app.manual_att_is_contractor(e.id)
   order by d.name nulls last, e.full_name
$$;

-- أيام موظفين بانتظار الكشف (في نطاق ساريٍ، يوم عمل، بلا إجازة معتمدة، وبلا سجل يدوي مطابق لإدخال الكشف)
create or replace function app.manual_att_pending_days(p_from date, p_to date, p_activation uuid default null)
returns table (activation_id uuid, portal text, employee_id uuid, work_date date)
language sql stable security definer set search_path = public, app as $$
  select a.id, a.portal, e.id, g.d::date
    from public.attendance_manual_activations a
    cross join lateral generate_series(greatest(a.starts_on, p_from)::timestamp, least(coalesce(a.ends_on, p_to), p_to)::timestamp, interval '1 day') g(d)
    join public.employees e on e.archived_at is null
                           and e.hire_date <= g.d::date and (e.terminated_at is null or g.d::date <= e.terminated_at)
                           and (a.branch_id is null or e.branch_id = a.branch_id)
                           and (a.department_id is null or e.department_id = a.department_id
                                or (a.include_sub_departments and e.department_id in (select app.hr_department_tree(a.department_id))))
    left join lateral app.hr_effective_shift(e.id, g.d::date) sh on true
   where (p_activation is null or a.id = p_activation)
     and not app.manual_att_is_contractor(e.id)
     and sh.shift_id is not null
     and extract(dow from g.d)::int::smallint = any (sh.work_days)
     and not exists (select 1 from public.hr_leaves l where l.employee_id = e.id and l.status = 'approved' and l.kind = 'leave' and g.d::date between l.start_date and l.end_date)
     -- صف المصدر manual لا يغلق اليوم وحده: لا بد من إدخال كشف يقابله بالحالة نفسها (أو حالة حضور مشتقة متوافقة).
     -- السجل اليدوي اليتيم أو المتعارض يبقى معلّقاً ويمنع اعتماد الشهر إلى أن يراجعه مسؤول مخوّل.
     and not exists (
       select 1
         from public.hr_attendance_days h
         join public.attendance_manual_entries en
           on en.employee_id = h.employee_id and en.work_date = h.work_date
          and ((en.status = 'present' and h.status in ('present', 'time_permit', 'late', 'early_leave', 'incomplete'))
               or (en.status = 'absent' and h.status = 'absent'))
        where h.employee_id = e.id and h.work_date = g.d::date and h.source = 'manual'
     )
$$;

-- بوابة اعتماد الحضورية: لا اعتماد ما دام في الشهر أيام بانتظار الكشف (حتى أمس، كأفق تغطية الاحتساب)
create or replace function app.manual_att_assert_complete(p_month date) returns void language plpgsql stable security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; v_last date := least((date_trunc('month', p_month) + interval '1 month - 1 day')::date, app.hr_local_date(now()) - 1); n int;
begin
  if v_last < m then return; end if;
  select count(distinct (p.employee_id, p.work_date)) into n from app.manual_att_pending_days(m, v_last) p;
  if n > 0 then raise exception 'ATT_MANUAL_SHEETS_PENDING: %', n; end if;
end$$;

-- ③ إشعارات (غرفة العمليات + الموارد البشرية + المعاون + التطوير + أصحاب بوابة الكشف) ─────────────────
create or replace function app.manual_att_notify(p_activation uuid, p_event text) returns void language plpgsql security definer set search_path = public, app as $$
declare a public.attendance_manual_activations; r record; v_role text; v_title text; v_body text; v_link text; v_scope text; v_label text;
begin
  select * into a from public.attendance_manual_activations where id = p_activation;
  if a.id is null then return; end if;
  select role into v_role from public.permission_portal_roles where portal = a.portal;
  v_label := app.manual_att_portal_label(a.portal);
  v_scope := app.manual_att_scope_label(a.branch_id, a.department_id, a.include_sub_departments);
  if p_event = 'on' then
    v_title := 'تفعيل الحضور اليدوي — ' || v_label;
    v_body := 'أُوقفت البصمة منطقياً لنطاق «' || v_scope || '» اعتباراً من ' || a.starts_on::text || ' وأُضيفت صفحة «الحضور اليدوي» في بوابة ' || v_label || '. السبب: ' || a.reason;
  else
    v_title := 'إيقاف الحضور اليدوي — ' || v_label;
    v_body := 'عادت البصمة لنطاق «' || v_scope || '» بعد ' || a.ends_on::text || '. الأيام التي لم يُسجَّل كشفها تبقى بانتظار الكشف وتمنع اعتماد الحضورية حتى تكتمل.';
  end if;
  for r in select distinct ur.user_id, ur.role from public.user_roles ur where ur.role = any (array['ops_room', 'hr_officer', 'deputy_director', 'it_admin']) or ur.role = v_role loop
    v_link := case when r.role = v_role and a.portal <> 'it' then '/' || a.portal || '/manual-attendance'
                   when r.role = 'ops_room' then '/ops-room/manual-attendance'
                   when r.role = 'it_admin' then '/it/integrations/attendance-manual'
                   when r.role = 'hr_officer' then '/hr/attendance' end;
    perform app.hr_notify(r.user_id, v_title, v_body, v_link, 'att_manual_' || p_event || ':' || a.id::text, 'warning');
  end loop;
end$$;

-- تذكير يومي بالكشوف الناقصة لأصحاب بوابة الكشف وغرفة العمليات (مفتاح يومي ⇒ لا تكرار)
create or replace function app.manual_att_remind() returns int language plpgsql security definer set search_path = public, app as $$
declare a record; r record; v_role text; v_n int; v_total int := 0; v_today date := app.hr_local_date(now()); v_link text;
begin
  for a in select * from public.attendance_manual_activations x where x.status = 'active' or x.ends_on >= v_today - 31 loop
    select count(*) into v_n from app.manual_att_pending_days(a.starts_on, least(coalesce(a.ends_on, v_today), v_today - 1), a.id);
    continue when v_n = 0;
    select role into v_role from public.permission_portal_roles where portal = a.portal;
    for r in select distinct ur.user_id, ur.role from public.user_roles ur where ur.role = 'ops_room' or ur.role = v_role loop
      v_link := case when r.role = v_role and a.portal <> 'it' then '/' || a.portal || '/manual-attendance' else '/ops-room/manual-attendance' end;
      perform app.hr_notify(r.user_id, 'كشف حضور يدوي ناقص — ' || app.manual_att_portal_label(a.portal),
        v_n || ' يوم/موظف بلا كشف في نطاق «' || app.manual_att_scope_label(a.branch_id, a.department_id, a.include_sub_departments) || '». لا يُعتمد حضور الشهر قبل اكتماله.',
        v_link, 'att_manual_rem:' || a.id::text || ':' || v_today::text, 'warning');
      v_total := v_total + 1;
    end loop;
  end loop;
  return v_total;
end$$;

-- ④ دوال الكتابة (الأصل في app ثم غلاف public بحارس التكرار/التزامن — نمط 00291) ───────────────────────
-- ④-أ التفعيل: دور it_admin حصراً (صلاحية الوحدة وحدها لا تفوّض التفعيل؛ الربط للواجهة فقط)
create or replace function app.attendance_manual_activate__raw(p_portal text, p_branch uuid, p_department uuid, p_include_sub boolean, p_reason text, p_starts_on date)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare today date := app.hr_local_date(now()); v_start date; v_id uuid; v_reason text := btrim(coalesce(p_reason, '')); v_emp int; v_cleared int := 0; m date; r record; v_other jsonb;
begin
  if not app.has_role(array['it_admin']) then raise exception 'PERMISSION_DENIED'; end if;
  perform app.require_can('it.integrations.attendance-manual', 'execute');
  if p_portal is null or p_portal = 'employee' or not exists (select 1 from public.permission_portal_roles where portal = p_portal)
     or not exists (select 1 from public.permission_units u where u.key = p_portal || '.manual-attendance') then raise exception 'ATT_MANUAL_PORTAL_INVALID'; end if;
  if p_branch is null and p_department is null then raise exception 'ATT_MANUAL_SCOPE_REQUIRED'; end if;
  if (p_branch is not null and not exists (select 1 from public.branches b where b.id = p_branch and b.archived_at is null))
     or (p_department is not null and not exists (select 1 from public.departments d where d.id = p_department and d.archived_at is null)) then raise exception 'ATT_MANUAL_SCOPE_INVALID'; end if;
  if length(v_reason) < 3 then raise exception 'ATT_MANUAL_REASON_REQUIRED'; end if;
  v_start := coalesce(p_starts_on, today);
  if v_start > today or v_start < today - 31 then raise exception 'ATT_MANUAL_START_INVALID'; end if;
  -- لا نغيّر أياماً في شهر مقفل مالياً أو معتمد الحضورية (إعادة فتحه من غرفة العمليات أولاً)
  for m in select g::date from generate_series(date_trunc('month', v_start), date_trunc('month', today), interval '1 month') g loop
    perform app.hr_payroll_lock_range(m, m);
    if app.hr_month_locked(m) then raise exception 'HR_MONTH_LOCKED'; end if;
    if app.hr_month_confirmed(m) then raise exception 'HR_ATTENDANCE_CONFIRMED'; end if;
  end loop;
  select count(*) into v_emp from public.employees e
   where e.archived_at is null and (e.terminated_at is null or e.terminated_at >= v_start)
     and (p_branch is null or e.branch_id = p_branch)
     and (p_department is null or e.department_id = p_department or (coalesce(p_include_sub, true) and e.department_id in (select app.hr_department_tree(p_department))))
     and not app.manual_att_is_contractor(e.id);
  if v_emp = 0 then raise exception 'ATT_MANUAL_SCOPE_EMPTY'; end if;
  begin
    insert into public.attendance_manual_activations (portal, branch_id, department_id, include_sub_departments, starts_on, reason, activated_by)
    values (p_portal, p_branch, p_department, coalesce(p_include_sub, true), v_start, v_reason, auth.uid()) returning id into v_id;
  exception when unique_violation then raise exception 'ATT_MANUAL_DUPLICATE_ACTIVE';
  end;
  -- ما بُني من البصمات قبل التفعيل في أيام النطاق يُزال ليحلّ الكشف محلّه (البصمات الخام محفوظة، والإجازة المعتمدة لا تُمسّ)
  for r in select distinct d.employee_id, d.work_date from public.hr_attendance_days d
            where d.source = 'auto' and d.work_date between v_start and today and app.manual_att_blocks_auto(d.employee_id, d.work_date) loop
    perform app.hr_evaluate_day(r.employee_id, r.work_date);
    v_cleared := v_cleared + 1;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'portal', o.portal)), '[]'::jsonb) into v_other
    from public.attendance_manual_activations o where o.status = 'active' and o.id <> v_id;
  perform app.manual_att_notify(v_id, 'on');
  return jsonb_build_object('id', v_id, 'portal', p_portal, 'starts_on', v_start, 'employees', v_emp, 'cleared_auto_days', v_cleared, 'other_active', v_other);
end$$;

-- ④-ب الإيقاف: تعود البصمة بعد آخر يوم مغطّى (الافتراضي اليوم نفسه كي لا يُظلم من لم يُسجَّل كشفه)
create or replace function app.attendance_manual_deactivate__raw(p_activation uuid, p_last_day date, p_note text)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare today date := app.hr_local_date(now()); a public.attendance_manual_activations; v_last date; r record; v_re int := 0; v_pending int; v_before jsonb; v_after jsonb;
begin
  if not app.has_role(array['it_admin']) then raise exception 'PERMISSION_DENIED'; end if;
  perform app.require_can('it.integrations.attendance-manual', 'execute');
  select * into a from public.attendance_manual_activations where id = p_activation for update;
  if a.id is null then raise exception 'ATT_MANUAL_NOT_FOUND'; end if;
  if a.status <> 'active' then raise exception 'ATT_MANUAL_ALREADY_ENDED'; end if;
  v_last := coalesce(p_last_day, today);
  if v_last > today or v_last < a.starts_on - 1 then raise exception 'ATT_MANUAL_END_INVALID'; end if;
  update public.attendance_manual_activations set status = 'ended', ends_on = v_last, ended_by = auth.uid(), ended_at = now(), end_note = nullif(btrim(coalesce(p_note, '')), '') where id = a.id;
  -- الأيام بعد آخر يوم مغطّى تعود للبصمة فوراً (حتى 31 يوماً؛ الأقدم يُحتسب عند اعتماد الشهر).
  -- إن سبق حفظ كشف اليوم ثم اختار IT تاريخ إصلاح أقدم، نزيل صف الكشف وحده ونُعيد المحرك من البصمات؛ نبقي مدخل الكشف وسجل التدقيق.
  -- لا نُسقط صفاً ما زال ضمن تفعيل آخر متداخل، ولا تصحيحاً يدوياً مستقلاً أو صفاً يتيماً بلا مدخل كشف.
  for r in select e.id as employee_id, g.d::date as work_date, h.id as attendance_id
             from public.employees e
            cross join lateral generate_series(greatest(v_last + 1, a.starts_on, today - 31)::timestamp, today::timestamp, interval '1 day') g(d)
            left join public.hr_attendance_days h on h.employee_id = e.id and h.work_date = g.d::date
            where e.archived_at is null
              and (a.branch_id is null or e.branch_id = a.branch_id)
              and (a.department_id is null or e.department_id = a.department_id or (a.include_sub_departments and e.department_id in (select app.hr_department_tree(a.department_id))))
              and not app.manual_att_in_scope(e.id, g.d::date)
              and (h.id is null or (h.source = 'manual' and h.edit_reason like 'كشف حضور يدوي%'
                   and exists (select 1 from public.attendance_manual_entries en where en.employee_id = e.id and en.work_date = g.d::date))) loop
    v_before := null;
    if r.attendance_id is not null then
      perform app.hr_payroll_lock_range(r.work_date, r.work_date);
      if app.hr_month_locked(r.work_date) then raise exception 'HR_MONTH_LOCKED'; end if;
      if app.hr_month_confirmed(r.work_date) then raise exception 'HR_ATTENDANCE_CONFIRMED'; end if;
      select to_jsonb(h) into v_before from public.hr_attendance_days h where h.id = r.attendance_id for update;
      delete from public.hr_attendance_days h where h.id = r.attendance_id;
    end if;
    perform app.hr_evaluate_day(r.employee_id, r.work_date);
    v_re := v_re + 1;
    if r.attendance_id is not null then
      select to_jsonb(h) into v_after from public.hr_attendance_days h where h.employee_id = r.employee_id and h.work_date = r.work_date;
      insert into public.hr_attendance_audit (employee_id, work_date, action, before, after, reason, actor)
      values (r.employee_id, r.work_date, 'reset_auto', v_before, v_after,
              'إيقاف الحضور اليدوي للتفعيل ' || a.id::text || ' — عادت البصمة بعد آخر يوم مغطّى (' || v_last::text || ')', auth.uid());
    end if;
  end loop;
  select count(distinct (p.employee_id, p.work_date)) into v_pending from app.manual_att_pending_days(a.starts_on, least(v_last, today), a.id) p;
  perform app.manual_att_notify(a.id, 'off');
  return jsonb_build_object('id', a.id, 'ends_on', v_last, 'reevaluated_days', v_re, 'pending_days', v_pending);
end$$;

-- ④-ج حفظ كشف يوم: كله أو لا شيء؛ حاضر = يوم كامل بأوقات الشفت، غائب = غياب كالحقيقي؛ تعديل مُدخَل سابق يحتاج سبباً
create or replace function app.manual_att_sheet_save__raw(p_activation uuid, p_date date, p_entries jsonb, p_note text)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare
  a public.attendance_manual_activations; me uuid := auth.uid(); today date := app.hr_local_date(now()); v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_missing int; v_locked int; v_changed int; v_dupe int; v_bad int; v_locked_name text; r record; pl record; v_in timestamptz; v_out timestamptz; v_worked int;
  v_before jsonb; v_after jsonb; v_reason text; n_new int := 0; n_chg int := 0; n_same int := 0; n_present int := 0; n_absent int := 0; v_left int;
begin
  if me is null then raise exception 'PERMISSION_DENIED'; end if;
  select * into a from public.attendance_manual_activations where id = p_activation for share;
  if a.id is null then raise exception 'ATT_MANUAL_NOT_FOUND'; end if;
  if not app.manual_att_can_record(a.portal) then raise exception 'PERMISSION_DENIED'; end if;
  if p_date is null then raise exception 'ATT_MANUAL_DATE_REQUIRED'; end if;
  if p_date > today then raise exception 'HR_FUTURE_DATE'; end if;
  if p_date < a.starts_on or p_date > coalesce(a.ends_on, today) then raise exception 'ATT_MANUAL_DATE_OUT_OF_RANGE'; end if;
  if not app.manual_att_is_senior() and p_date < today - app.hr_policy_int('backdated_max_days', 7) then raise exception 'ATT_MANUAL_WINDOW_CLOSED'; end if;
  perform app.hr_payroll_lock_range(p_date, p_date);
  if app.hr_month_locked(p_date) then raise exception 'HR_MONTH_LOCKED'; end if;
  if app.hr_month_confirmed(p_date) then raise exception 'HR_ATTENDANCE_CONFIRMED'; end if;
  if jsonb_typeof(p_entries) is distinct from 'array' or jsonb_array_length(p_entries) = 0 then raise exception 'ATT_MANUAL_ENTRIES_REQUIRED'; end if;
  if jsonb_array_length(p_entries) > 2000 then raise exception 'ATT_MANUAL_TOO_MANY'; end if;
  -- ① تحقق كامل قبل أي كتابة
  select count(*) filter (where (e ->> 'employee_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or coalesce(e ->> 'status', '') not in ('present', 'absent')),
         count(*) - count(distinct e ->> 'employee_id')
    into v_bad, v_dupe from jsonb_array_elements(p_entries) e;
  if v_bad > 0 then raise exception 'ATT_MANUAL_ENTRY_INVALID'; end if;
  if v_dupe > 0 then raise exception 'ATT_MANUAL_DUPLICATE_ENTRY'; end if;
  with req as (select (e ->> 'employee_id')::uuid as emp, e ->> 'status' as st from jsonb_array_elements(p_entries) e),
       rw as (select * from app.manual_att_sheet_rows(p_activation, p_date))
  select count(*) filter (where rw.employee_id is null),
         count(*) filter (where rw.employee_id is not null and rw.state <> 'open'
                           and not (rw.state = 'other' and rw.existing_source = 'manual' and app.manual_att_can_review())),
         count(*) filter (where (rw.state = 'open' and rw.entry is not null and rw.entry <> q.st)
                           or (rw.state = 'other' and rw.existing_source = 'manual' and app.manual_att_can_review())),
         (array_agg(rw.full_name) filter (where rw.state <> 'open'
                           and not (rw.state = 'other' and rw.existing_source = 'manual' and app.manual_att_can_review())))[1]
    into v_missing, v_locked, v_changed, v_locked_name
    from req q left join rw on rw.employee_id = q.emp;
  if v_missing > 0 then raise exception 'ATT_MANUAL_EMPLOYEE_NOT_IN_SCOPE'; end if;
  if v_locked > 0 then raise exception 'ATT_MANUAL_EMPLOYEE_LOCKED: %', v_locked_name; end if;
  if v_changed > 0 and (v_note is null or length(v_note) < 3) then raise exception 'ATT_MANUAL_NOTE_REQUIRED'; end if;
  -- ② الكتابة
  for r in
    with req as (select (e ->> 'employee_id')::uuid as emp, e ->> 'status' as st from jsonb_array_elements(p_entries) e),
         rw as (select * from app.manual_att_sheet_rows(p_activation, p_date))
    select q.emp, q.st, rw.entry as prev_entry, rw.existing_source as prev_source, rw.state as prev_state
      from req q join rw on rw.employee_id = q.emp
     where rw.state = 'open' or (rw.state = 'other' and rw.existing_source = 'manual' and app.manual_att_can_review())
     order by rw.full_name
  loop
    -- لا نتجاوز المراجع في state=other حتى لو اختار حالة إدخال الكشف نفسها؛ فقد يكون صف الحضور هو المختلف.
    if r.prev_state = 'open' and r.prev_entry is not distinct from r.st then n_same := n_same + 1; continue; end if;
    select * into pl from app.manual_att_day_plan(r.emp, p_date);
    select to_jsonb(d) into v_before from public.hr_attendance_days d where d.employee_id = r.emp and d.work_date = p_date;
    if r.st = 'present' then
      v_in := pl.exp_in; v_out := pl.exp_out; v_worked := case when pl.exp_in is null then 0 else pl.required_minutes end;
    else
      v_in := null; v_out := null; v_worked := 0;
    end if;
    v_reason := 'كشف حضور يدوي — ' || app.manual_att_portal_label(a.portal)
      || case when r.prev_state = 'other' then ' — مراجعة سجل يدوي سابق: ' || v_note
              when r.prev_entry is not null then ' — تعديل: ' || v_note else '' end;
    insert into public.hr_attendance_days as d (employee_id, work_date, shift_name, expected_in, expected_out, is_rest_day, check_in, check_out, late_minutes, early_minutes, worked_minutes, status, source, edited_by, edited_at, edit_reason)
    values (r.emp, p_date, pl.shift_name, pl.exp_in, pl.exp_out, false, v_in, v_out, 0, 0, v_worked, r.st, 'manual', me, now(), v_reason)
    on conflict (employee_id, work_date) do update set
      shift_name = excluded.shift_name, expected_in = excluded.expected_in, expected_out = excluded.expected_out, is_rest_day = false,
      check_in = excluded.check_in, check_out = excluded.check_out, late_minutes = 0, early_minutes = 0, worked_minutes = excluded.worked_minutes,
      status = excluded.status, source = 'manual', approved_permit_original = null, manual_punch_correction = null,
      edited_by = me, edited_at = now(), edit_reason = excluded.edit_reason, updated_at = now();
    -- مزامنة الزمنية المعتمدة مع الصف اليدوي (كبقية مسارات التعديل)
    perform app.hr_evaluate_day(r.emp, p_date);
    select to_jsonb(d) into v_after from public.hr_attendance_days d where d.employee_id = r.emp and d.work_date = p_date;
    insert into public.hr_attendance_audit (employee_id, work_date, action, before, after, reason, actor)
    values (r.emp, p_date, 'edit', v_before, v_after || jsonb_build_object('manual_sheet', jsonb_build_object('activation', a.id, 'portal', a.portal, 'status', r.st)), v_reason, me);
    insert into public.attendance_manual_entries as en (employee_id, work_date, activation_id, portal, status, note, entered_by, entered_at, updated_by, updated_at, revision)
    values (r.emp, p_date, a.id, a.portal, r.st, v_note, me, now(), me, now(), 1)
    on conflict (employee_id, work_date) do update set activation_id = excluded.activation_id, portal = excluded.portal, status = excluded.status,
      note = excluded.note, updated_by = me, updated_at = now(), revision = en.revision + 1;
    begin perform app.hr_refresh_alerts(r.emp, p_date); exception when others then null; end;
    if r.prev_state = 'other' or r.prev_entry is not null then n_chg := n_chg + 1; else n_new := n_new + 1; end if;
    if r.st = 'present' then n_present := n_present + 1; else n_absent := n_absent + 1; end if;
  end loop;
  select count(*) into v_left from app.manual_att_sheet_rows(a.id, p_date) x where (x.state = 'open' and x.entry is null) or x.state = 'other';
  return jsonb_build_object('saved', n_new, 'changed', n_chg, 'unchanged', n_same, 'present', n_present, 'absent', n_absent, 'pending_left', v_left, 'date', p_date);
end$$;
revoke all on function app.attendance_manual_activate__raw(text, uuid, uuid, boolean, text, date), app.attendance_manual_deactivate__raw(uuid, date, text),
  app.manual_att_sheet_save__raw(uuid, date, jsonb, text) from public, anon, authenticated;

-- أغلفة public (حارس التكرار/التزامن ثم الأصل)
create or replace function public.attendance_manual_activate(p_portal text, p_branch uuid default null, p_department uuid default null, p_include_sub boolean default true, p_reason text default null, p_starts_on date default null)
returns jsonb language plpgsql security definer set search_path = public, app as $$
begin
  perform app.guard_duplicate('attendance_manual_activate', jsonb_build_object('p_portal', p_portal, 'p_branch', p_branch, 'p_department', p_department, 'p_include_sub', p_include_sub, 'p_reason', p_reason, 'p_starts_on', p_starts_on));
  return app.attendance_manual_activate__raw(p_portal, p_branch, p_department, p_include_sub, p_reason, p_starts_on);
end$$;

create or replace function public.attendance_manual_deactivate(p_activation uuid, p_last_day date default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public, app as $$
begin
  perform app.guard_duplicate('attendance_manual_deactivate', jsonb_build_object('p_activation', p_activation, 'p_last_day', p_last_day, 'p_note', p_note));
  perform app.guard_record_lock(p_activation);
  return app.attendance_manual_deactivate__raw(p_activation, p_last_day, p_note);
end$$;

create or replace function public.manual_att_sheet_save(p_activation uuid, p_date date, p_entries jsonb, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public, app as $$
begin
  perform app.guard_duplicate('manual_att_sheet_save', jsonb_build_object('p_activation', p_activation, 'p_date', p_date, 'p_entries', p_entries, 'p_note', p_note));
  perform app.guard_record_lock(p_activation);
  return app.manual_att_sheet_save__raw(p_activation, p_date, p_entries, p_note);
end$$;

-- ⑤ القراءات ────────────────────────────────────────────────────────────────────────────────
-- كشف يوم لتفعيل: الموظفون وحالاتهم + شريط الأيام (المنجز/المعلّق) + ما استُثني من الكشف
create or replace function public.manual_att_sheet_get(p_activation uuid, p_date date default null) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare a public.attendance_manual_activations; today date := app.hr_local_date(now()); v_from date; v_to date; v_date date; v_lock text; v_days jsonb := '[]'::jsonb; v_emps jsonb := '[]'::jsonb; d date; v_nopin int; v_contr int; v_senior boolean := app.manual_att_is_senior();
begin
  select * into a from public.attendance_manual_activations where id = p_activation;
  if a.id is null then raise exception 'ATT_MANUAL_NOT_FOUND'; end if;
  if not app.manual_att_can_record(a.portal) then raise exception 'PERMISSION_DENIED'; end if;
  v_to := least(coalesce(a.ends_on, today), today);
  v_from := greatest(case when v_senior then a.starts_on else greatest(a.starts_on, today - app.hr_policy_int('backdated_max_days', 7)) end, v_to - 61);
  if v_to >= v_from then
    v_date := coalesce(p_date, v_to);
    if v_date < v_from or v_date > v_to then raise exception 'ATT_MANUAL_DATE_OUT_OF_RANGE'; end if;
    for d in select g::date from generate_series(v_to::timestamp, v_from::timestamp, interval '-1 day') g loop
      v_days := v_days || (select jsonb_build_array(jsonb_build_object('date', d,
        'total', count(*) filter (where x.state in ('open', 'other')),
        'entered', count(*) filter (where x.state = 'open' and x.entry is not null),
        'pending', count(*) filter (where (x.state = 'open' and x.entry is null) or x.state = 'other'))) from app.manual_att_sheet_rows(a.id, d) x);
    end loop;
    v_lock := case when app.hr_month_locked(v_date) then 'month_locked' when app.hr_month_confirmed(v_date) then 'month_confirmed' end;
    select coalesce(jsonb_agg(jsonb_build_object('id', x.employee_id, 'name', x.full_name, 'number', x.employee_number, 'job_title', x.job_title, 'department', x.department_name,
        'has_shift', x.has_shift, 'state', x.state, 'entry', x.entry, 'note', x.entry_note, 'by', x.entered_by_name, 'at', x.entered_at,
        'punches', x.punch_count, 'first_punch', x.first_punch, 'last_punch', x.last_punch, 'status', x.existing_status, 'source', x.existing_source)), '[]'::jsonb)
      into v_emps from app.manual_att_sheet_rows(a.id, v_date) x;
  end if;
  select count(*) filter (where e.biometric_pin is null), count(*) filter (where e.biometric_pin is not null and app.manual_att_is_contractor(e.id))
    into v_nopin, v_contr
    from public.employees e
   where e.archived_at is null and e.hire_date <= coalesce(v_date, today) and (e.terminated_at is null or coalesce(v_date, today) <= e.terminated_at)
     and (a.branch_id is null or e.branch_id = a.branch_id)
     and (a.department_id is null or e.department_id = a.department_id or (a.include_sub_departments and e.department_id in (select app.hr_department_tree(a.department_id))));
  return jsonb_build_object(
    'activation', jsonb_build_object('id', a.id, 'portal', a.portal, 'portal_label', app.manual_att_portal_label(a.portal), 'status', a.status, 'starts_on', a.starts_on, 'ends_on', a.ends_on, 'reason', a.reason,
      'branch_id', a.branch_id, 'department_id', a.department_id, 'include_sub_departments', a.include_sub_departments,
      'scope_label', app.manual_att_scope_label(a.branch_id, a.department_id, a.include_sub_departments)),
    'date', v_date, 'today', today, 'from', v_from, 'to', v_to, 'lock', v_lock, 'can_review', app.manual_att_can_review(), 'days', v_days, 'employees', v_emps,
    'excluded', jsonb_build_object('no_pin', coalesce(v_nopin, 0), 'contractors', coalesce(v_contr, 0)));
end$$;

-- تفعيلاتي: ما يحق لي تسجيل كشفه (الفعّال، والمنتهي ما دام فيه أيام بانتظار الكشف) — مصدر ظهور الصفحة في القائمة الجانبية
create or replace function public.manual_att_my_activations() returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare today date := app.hr_local_date(now()); out jsonb := '[]'::jsonb; a record; v_n int;
begin
  if auth.uid() is null then return out; end if;
  for a in select * from public.attendance_manual_activations x order by x.status, x.starts_on desc loop
    continue when not app.manual_att_can_record(a.portal);
    select count(distinct (p.employee_id, p.work_date)) into v_n from app.manual_att_pending_days(a.starts_on, least(coalesce(a.ends_on, today), today), a.id) p;
    continue when a.status = 'ended' and v_n = 0;
    out := out || jsonb_build_array(jsonb_build_object('id', a.id, 'portal', a.portal, 'portal_label', app.manual_att_portal_label(a.portal), 'status', a.status,
      'starts_on', a.starts_on, 'ends_on', a.ends_on, 'pending', v_n, 'scope_label', app.manual_att_scope_label(a.branch_id, a.department_id, a.include_sub_departments)));
  end loop;
  return out;
end$$;

-- قائمة التفعيلات لتقنية المعلومات (الفعّال والتاريخ) مع العدّادات
create or replace function public.attendance_manual_list(p_only_active boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare today date := app.hr_local_date(now()); out jsonb := '[]'::jsonb; a record; v_pending int; v_dates int; v_entries int; v_emp int;
begin
  perform app.require_can('it.integrations.attendance-manual', 'view');
  for a in select * from public.attendance_manual_activations x where (not coalesce(p_only_active, false)) or x.status = 'active' order by (x.status = 'active') desc, x.activated_at desc limit 200 loop
    select count(distinct (p.employee_id, p.work_date)), count(distinct p.work_date) into v_pending, v_dates
      from app.manual_att_pending_days(a.starts_on, least(coalesce(a.ends_on, today), today), a.id) p;
    select count(*) into v_entries from public.attendance_manual_entries en where en.activation_id = a.id;
    select count(*) into v_emp from public.employees e
     where e.archived_at is null and e.biometric_pin is not null and (e.terminated_at is null or e.terminated_at >= a.starts_on)
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

-- معاينة النطاق قبل التفعيل: كم موظفاً سيدخل الكشف، ومن سيُستثنى، وما يتقاطع مع تفعيلات سارية
create or replace function public.attendance_manual_scope_preview(p_branch uuid default null, p_department uuid default null, p_include_sub boolean default true) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare v_pin int; v_nopin int; v_contr int; v_sample jsonb; v_over jsonb; today date := app.hr_local_date(now());
begin
  perform app.require_can('it.integrations.attendance-manual', 'view');
  if p_branch is null and p_department is null then raise exception 'ATT_MANUAL_SCOPE_REQUIRED'; end if;
  with sc as (
    select e.* from public.employees e
     where e.archived_at is null and (e.terminated_at is null or e.terminated_at >= today)
       and (p_branch is null or e.branch_id = p_branch)
       and (p_department is null or e.department_id = p_department or (coalesce(p_include_sub, true) and e.department_id in (select app.hr_department_tree(p_department)))))
  select count(*) filter (where biometric_pin is not null and not app.manual_att_is_contractor(id)),
         count(*) filter (where biometric_pin is null),
         count(*) filter (where biometric_pin is not null and app.manual_att_is_contractor(id)),
         coalesce(jsonb_agg(full_name order by full_name) filter (where biometric_pin is not null and not app.manual_att_is_contractor(id)), '[]'::jsonb),
         (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'portal', o.portal, 'portal_label', app.manual_att_portal_label(o.portal))), '[]'::jsonb)
            from public.attendance_manual_activations o
           where o.status = 'active'
             and (o.branch_id is null or p_branch is null or o.branch_id = p_branch)
             and (o.department_id is null or p_department is null or o.department_id = p_department
                  or (o.include_sub_departments and p_department in (select app.hr_department_tree(o.department_id)))
                  or (coalesce(p_include_sub, true) and o.department_id in (select app.hr_department_tree(p_department)))))
    into v_pin, v_nopin, v_contr, v_sample, v_over
    from sc;
  return jsonb_build_object('employees', v_pin, 'no_pin', v_nopin, 'contractors', v_contr, 'sample', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select jsonb_array_elements(v_sample) x limit 8) s), 'overlapping', v_over);
end$$;

-- خيارات التفعيل لواجهة التطوير: البوابات القابلة للتفعيل مع عدد أصحاب حسابات كل بوابة، واقتراح النطاق من قسم/فرع موظفي هذه الحسابات
create or replace function public.attendance_manual_portal_options() returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
begin
  perform app.require_can('it.integrations.attendance-manual', 'view');
  return coalesce((
    select jsonb_agg(o.j order by o.ord)
      from (
        select array_position(array['hr','manager','finance','it','admin','field-ops','admin-ops','maintenance','transfer-station','executive','deputy','ops-room','ops-room-manager','complaints','media','central-garage','follow-up'], u.portal) as ord,
               jsonb_build_object('portal', u.portal, 'label', app.manual_att_portal_label(u.portal),
                 'holders', (select count(*) from public.user_roles ur where ur.role::text = pr.role),
                 'departments', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'employees', x.n) order by x.n desc, x.name)
                      from (select d.id, d.name, count(*) as n
                              from public.user_roles ur
                              join public.employees e on e.user_id = ur.user_id and e.archived_at is null and e.terminated_at is null
                              join public.departments d on d.id = e.department_id and d.archived_at is null
                             where ur.role::text = pr.role group by d.id, d.name order by 3 desc, 2 limit 3) x), '[]'::jsonb),
                 'branches', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'employees', x.n) order by x.n desc, x.name)
                      from (select b.id, b.name, count(*) as n
                              from public.user_roles ur
                              join public.employees e on e.user_id = ur.user_id and e.archived_at is null and e.terminated_at is null
                              join public.branches b on b.id = e.branch_id and b.archived_at is null
                             where ur.role::text = pr.role group by b.id, b.name order by 3 desc, 2 limit 3) x), '[]'::jsonb)) as j
          from (select split_part(k.key, '.', 1) as portal from public.permission_units k where k.key like '%.manual-attendance') u
          join public.permission_portal_roles pr on pr.portal = u.portal
      ) o), '[]'::jsonb);
end$$;

-- ملخص الأيام المعلّقة لشهر (لغرفة العمليات قبل الاعتماد، والموارد البشرية، والتطوير)
-- الأفق «حتى أمس» تماماً كبوابة الاعتماد app.manual_att_assert_complete: يوم اليوم لم ينتهِ بعد (الكشف يُسجَّل أثناءه وبعده)،
-- فلا يمنع الاعتماد ولا يدخل في هذا الرقم؛ أما عدّادات التقنية وصفحة البوابة فتشمله لأنها «ما بقي لتسجيله».
create or replace function public.attendance_manual_pending_summary(p_month date) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; v_last date := least((date_trunc('month', p_month) + interval '1 month - 1 day')::date, app.hr_local_date(now()) - 1); v_rows jsonb;
begin
  if not app.has_role(array['ops_room', 'hr_officer', 'deputy_director', 'it_admin', 'super_admin']) then raise exception 'PERMISSION_DENIED'; end if;
  if v_last < m then return jsonb_build_object('month', m, 'total', 0, 'items', '[]'::jsonb); end if;
  select coalesce(jsonb_agg(jsonb_build_object('activation_id', x.activation_id, 'portal', x.portal, 'portal_label', app.manual_att_portal_label(x.portal), 'days', x.days, 'items', x.items) order by x.portal), '[]'::jsonb) into v_rows
    from (select p.activation_id, p.portal, count(distinct p.work_date) as days, count(*) as items from app.manual_att_pending_days(m, v_last) p group by p.activation_id, p.portal) x;
  -- الإجمالي = أزواج (موظف، يوم) فريدة (قد يقع الموظف في نطاقي تفعيلين) — هو نفسه الرقم الذي يمنع اعتماد الحضورية
  return jsonb_build_object('month', m, 'total', (select count(distinct (p.employee_id, p.work_date)) from app.manual_att_pending_days(m, v_last) p), 'items', v_rows);
end$$;

-- عدّادات الحضور اليدوي لكل موظف في شهر (للتقرير الشهري: شارة «يدوي»)
create or replace function public.attendance_manual_month_counts(p_month date) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date;
begin
  if not app.has_role(array['ops_room', 'hr_officer', 'deputy_director', 'it_admin', 'super_admin']) then raise exception 'PERMISSION_DENIED'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('employee_id', x.employee_id, 'days', x.days, 'present', x.present, 'absent', x.absent) order by x.employee_id)
    from (select en.employee_id, count(*) as days, count(*) filter (where en.status = 'present') as present, count(*) filter (where en.status = 'absent') as absent
            from public.attendance_manual_entries en
            join public.hr_attendance_days h on h.employee_id = en.employee_id and h.work_date = en.work_date
             and h.source = 'manual' and h.edit_reason like 'كشف حضور يدوي%'
           where en.work_date >= m and en.work_date < (m + interval '1 month')::date
           group by en.employee_id) x), '[]'::jsonb);
end$$;

revoke all on function public.attendance_manual_activate(text, uuid, uuid, boolean, text, date), public.attendance_manual_deactivate(uuid, date, text),
  public.manual_att_sheet_save(uuid, date, jsonb, text), public.manual_att_sheet_get(uuid, date), public.manual_att_my_activations(),
  public.attendance_manual_list(boolean), public.attendance_manual_scope_preview(uuid, uuid, boolean), public.attendance_manual_pending_summary(date),
  public.attendance_manual_month_counts(date), public.attendance_manual_portal_options() from public, anon;
grant execute on function public.attendance_manual_activate(text, uuid, uuid, boolean, text, date), public.attendance_manual_deactivate(uuid, date, text),
  public.manual_att_sheet_save(uuid, date, jsonb, text), public.manual_att_sheet_get(uuid, date), public.manual_att_my_activations(),
  public.attendance_manual_list(boolean), public.attendance_manual_scope_preview(uuid, uuid, boolean), public.attendance_manual_pending_summary(date),
  public.attendance_manual_month_counts(date), public.attendance_manual_portal_options() to authenticated;
revoke all on function app.manual_att_portal_label(text), app.manual_att_scope_label(uuid, uuid, boolean), app.manual_att_is_contractor(uuid), app.manual_att_in_scope(uuid, date, uuid),
  app.manual_att_stopped(uuid, date), app.manual_att_blocks_auto(uuid, date), app.manual_att_can_record(text), app.manual_att_can_review(), app.manual_att_is_senior(), app.manual_att_day_plan(uuid, date),
  app.manual_att_sheet_rows(uuid, date), app.manual_att_pending_days(date, date, uuid), app.manual_att_assert_complete(date), app.manual_att_notify(uuid, text), app.manual_att_remind()
  from public, anon, authenticated;
grant execute on function app.manual_att_remind() to service_role, postgres;

-- ⑥ تعديلات المحرّك والمتعهدين: نص الدالة الحيّ نفسه + سطور محدّدة، بحارس «يجب أن يوجد المرجع مرة واحدة بالضبط» ─────────
create or replace function pg_temp.att_manual_patch(p_sig regprocedure, p_anchor text, p_replacement text, p_marker text) returns void language plpgsql as $$
declare v_def text; v_hits int;
begin
  v_def := pg_get_functiondef(p_sig);
  if position(p_marker in v_def) > 0 then return; end if;
  v_hits := (length(v_def) - length(replace(v_def, p_anchor, ''))) / length(p_anchor);
  if v_hits <> 1 then raise exception 'ATT_MANUAL_PATCH_GUARD: % — المرجع «%» وُجد % مرة (المطلوب مرة واحدة)', p_sig::text, left(p_anchor, 70), v_hits; end if;
  execute replace(v_def, p_anchor, p_replacement);
end $$;

-- ٦-أ المحرّك: يوم في نطاق مفعَّل بلا كشف لا يُنتج صفاً تلقائياً (الصف اليدوي أعلاه يسبقه دائماً ويُحترَم كما هو)
select pg_temp.att_manual_patch('app.hr_evaluate_day_00350_base(uuid,date)'::regprocedure,
  $a$if exists (select 1 from public.hr_attendance_days where employee_id = p_employee and work_date = p_date and source = 'manual') then return; end if;$a$,
  $r$if exists (select 1 from public.hr_attendance_days where employee_id = p_employee and work_date = p_date and source = 'manual') then return; end if;
  -- الحضور اليدوي: الكشف هو المصدر الوحيد لموظفي نطاق مفعَّل في أيام التفعيل ⇒ لا صف تلقائي ولا غياب تلقائي؛ اليوم «بانتظار الكشف»
  if app.manual_att_blocks_auto(p_employee, p_date) then
    delete from public.hr_attendance_days where employee_id = p_employee and work_date = p_date and source = 'auto';
    return;
  end if;$r$,
  'manual_att_blocks_auto');

-- ٦-ب اعتماد الحضورية: رسالة صريحة بدل «أيام غير محتسبة» العامة
select pg_temp.att_manual_patch('app.ops_attendance_confirm__raw(date)'::regprocedure,
  $a$n := app.hr_evaluate_month(m);$a$,
  $r$n := app.hr_evaluate_month(m);
  perform app.manual_att_assert_complete(m);   -- الحضور اليدوي: لا اعتماد قبل اكتمال الكشوف$r$,
  'manual_att_assert_complete');

-- ٦-ج أجور المتعهدين: يوم في نطاق موقوف البصمة يُدفع من العدد المرسَل (لا سجل حضور ولا استقطاع نقص)
select pg_temp.att_manual_patch('app.contractor_wage_days(date,uuid)'::regprocedure,
  $a$e.id as employee_id, h.id as att_id, h.status as att_status, h.check_in, h.check_out,$a$,
  $r$e.id as employee_id, app.manual_att_stopped(e.id, d.log_date) as man, h.id as att_id, h.status as att_status, h.check_in, h.check_out,$r$,
  'manual_att_stopped');
select pg_temp.att_manual_patch('app.contractor_wage_days(date,uuid)'::regprocedure,
  $a$case when j.att_id is not null and j.att_status in ('present', 'late', 'early_leave', 'time_permit', 'incomplete') then 'paid' else 'blocked' end as st,$a$,
  $r$case when j.man then 'paid' when j.att_id is not null and j.att_status in ('present', 'late', 'early_leave', 'time_permit', 'incomplete') then 'paid' else 'blocked' end as st,$r$,
  'when j.man then ''paid''');
select pg_temp.att_manual_patch('app.contractor_wage_days(date,uuid)'::regprocedure,
  $a$case when j.att_id is null then 'no_record'$a$,
  $r$case when j.man then null when j.att_id is null then 'no_record'$r$,
  'when j.man then null');
select pg_temp.att_manual_patch('app.contractor_wage_days(date,uuid)'::regprocedure,
  $a$case when g.st = 'paid' and g.att_status <> 'incomplete' and g.req > 0 and g.short > 0$a$,
  $r$case when g.st = 'paid' and not g.man and g.att_status <> 'incomplete' and g.req > 0 and g.short > 0$r$,
  'not g.man');
select pg_temp.att_manual_patch('app.contractor_wages_state(date)'::regprocedure,
  $a$exists (select 1 from public.employees e where e.user_id = w.contractor_user_id and e.biometric_pin is not null) as has_fp$a$,
  $r$(exists (select 1 from public.employees e where e.user_id = w.contractor_user_id and e.biometric_pin is not null)
              or not coalesce(bool_or(w.block_reason = 'no_record'), false)) as has_fp$r$,
  'bool_or(w.block_reason = ''no_record'')');

-- ⑦ كتالوجا الاحتفاظ والتصفير: الجدولان سجلان تشغيليان محميان؛ يُصفَّران مع فئة «الحضور» فقط ─────────────────────
create or replace function app.platform_reset_catalog_attmanual() returns table(key text, label text, grp text, sort integer, tables text[], buckets text[])
language sql immutable as $$
  select c.key, c.label, c.grp, c.sort,
         case when c.key = 'attendance' then c.tables || array['attendance_manual_entries', 'attendance_manual_activations'] else c.tables end,
         c.buckets
    from app.platform_reset_catalog_disbursements() c
$$;
create or replace function app.data_retention_catalog_attmanual() returns table(data_key text, portal_key text, label text, description text, table_name text, time_column text, keep_where text, safety_lock text, deletable boolean, default_months integer, default_export_required boolean)
language sql immutable as $$
  select * from app.data_retention_catalog_disbursements()
  union all select 'attendance_manual_activations', 'hr', 'تفعيلات الحضور اليدوي', 'متى أُوقفت البصمة منطقياً لأي بوابة ونطاق، ومن فعّل وأوقف ولماذا.', 'attendance_manual_activations', null::text, null::text, 'سجل تشغيلي ومالي محمي من الحذف الزمني التلقائي', false, 0, false
  union all select 'attendance_manual_entries', 'hr', 'مدخلات كشوف الحضور اليدوي', 'حاضر/غائب لكل موظف ويوم: من سجّله ومتى وبأي تفعيل، وآخر تعديل وسببه.', 'attendance_manual_entries', null::text, null::text, 'سجل تشغيلي ومالي محمي من الحذف الزمني التلقائي', false, 0, false
$$;
revoke all on function app.platform_reset_catalog_attmanual(), app.data_retention_catalog_attmanual() from public, anon, authenticated;

-- الدالتان العليا تُعاد توجيههما إلى طبقتنا بتعديل نصهما الحيّ نفسه (لا نسخ يدوي) مع حارس «مرجع واحد بالضبط»
select pg_temp.att_manual_patch('app.platform_reset_catalog()'::regprocedure, 'app.platform_reset_catalog_disbursements()', 'app.platform_reset_catalog_attmanual()', 'app.platform_reset_catalog_attmanual()');
select pg_temp.att_manual_patch('app.data_retention_catalog()'::regprocedure, 'app.data_retention_catalog_disbursements()', 'app.data_retention_catalog_attmanual()', 'app.data_retention_catalog_attmanual()');

-- ⑧ تذكير يومي (08:15 بغداد = 05:15 UTC) إن توفّر pg_cron
do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'attendance_manual_remind_daily') then perform cron.unschedule('attendance_manual_remind_daily'); end if;
    perform cron.schedule('attendance_manual_remind_daily', '15 5 * * *', 'select app.manual_att_remind()');
  end if;
end $cron$;
