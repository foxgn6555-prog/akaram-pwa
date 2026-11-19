-- 20261118150000 — صلاحية كشف الحضور اليدوي على مستوى الحساب.
-- غرفة العمليات (ops_room) وحدها مخوّلة تلقائياً لكل تفعيل؛ بقية الحسابات تحتاج تفويضاً صريحاً من IT ودور البوابة المعنية.
-- يمكن توثيق حسابات ops_room في قائمة التفويض أيضاً. المدير المفوّض وIT وأي دور آخر لا يتجاوزونها تلقائياً.
-- يحتفظ الحساب المخوّل بوصوله إلى التفعيل المنتهي ما دام فيه يوم موظف بانتظار الكشف فقط.

-- حسابات إضافية مخوّلة لكل تفعيل. لا توجد قراءة/كتابة مباشرة من PostgREST؛ الدوال أدناه هي الواجهة.
create table if not exists public.attendance_manual_recorders (
  id            uuid primary key default gen_random_uuid(),
  activation_id uuid not null references public.attendance_manual_activations(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  granted_by    uuid references auth.users(id) on delete set null,
  granted_at    timestamptz not null default now(),
  unique (activation_id, user_id)
);
create index if not exists attendance_manual_recorders_user_idx on public.attendance_manual_recorders(user_id, activation_id);
alter table public.attendance_manual_recorders enable row level security;
revoke all on table public.attendance_manual_recorders from public, anon, authenticated;
drop trigger if exists trg_audit_attendance_manual_recorders on public.attendance_manual_recorders;
create trigger trg_audit_attendance_manual_recorders after insert or update or delete on public.attendance_manual_recorders
  for each row execute function app.audit_trigger();

-- الصلاحية تُفحص على معرّف التفعيل، لا على أي امتياز عام للدور.
-- ops_room وحده يرى الكل افتراضياً؛ غيره يجب أن يكون ضمن القائمة ويحمل دور بوابة التفعيل، حتى لو تغيّر الدور لاحقاً.
-- عند الإيقاف يستمر الوصول للمعلّق فقط، ويُسحب تلقائياً فور اكتماله.
create or replace function app.manual_att_can_record(p_activation uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select auth.uid() is not null
     and exists (
       select 1
         from public.attendance_manual_activations a
        where a.id = p_activation
          and (a.status = 'active'
               or (a.status = 'ended' and exists (
                 select 1 from app.manual_att_pending_days(a.starts_on, least(a.ends_on, app.hr_local_date(now())), a.id)
               )))
          and (
            (
              app.has_role(array['ops_room'])
              and app.can(auth.uid(), 'ops-room.manual-attendance', 'view')
              and app.can(auth.uid(), 'ops-room.manual-attendance', 'create')
            )
            or (
              exists (select 1 from public.attendance_manual_recorders r where r.activation_id = a.id and r.user_id = auth.uid())
              and exists (
                select 1
                  from public.user_roles ur
                  join public.permission_portal_roles pr on pr.role = ur.role and pr.portal = a.portal
                  join public.permission_units pu on pu.key = pr.portal || '.manual-attendance'
                 where ur.user_id = auth.uid()
              )
              and app.can(auth.uid(), a.portal || '.manual-attendance', 'view')
              and app.can(auth.uid(), a.portal || '.manual-attendance', 'create')
            )
          )
     )
$$;

-- أبقِ التوقيع القديم آمناً لمن بقي يستدعيه: لا يسمح إلا لغرفة العمليات، ولا يمنح بوابة التفعيل أو المدير المفوّض تجاوزاً.
create or replace function app.manual_att_can_record(p_portal text) returns boolean
language sql stable security definer set search_path = public, app as $$
  select auth.uid() is not null and app.has_role(array['ops_room'])
$$;

-- امتياز النافذة الأوسع يخص غرفة العمليات وحدها؛ اختيار حساب آخر لا يمنحه امتيازاً من دوره السابق.
create or replace function app.manual_att_is_senior() returns boolean
language sql stable security definer set search_path = public, app as $$
  select auth.uid() is not null and app.has_role(array['ops_room'])
$$;

-- بلا شفت لا يوجد يوم عمل معروف للتسجيل. يُعرض الموظف بقفل واضح ويُطلب إسناد شفت أولاً.
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
           when sh.shift_id is null then 'no_shift'
           when not (extract(dow from p_date)::int::smallint = any (sh.work_days)) then 'rest'
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

-- الأيام التي تتطلب كشفاً معروفة فقط عندما يوجد شفت ويكون اليوم يوم عمل لذلك الشفت.
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
     -- صف المصدر manual لا يغلق اليوم وحده: لا بد من إدخال كشف يقابله بالحالة نفسها.
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

-- الحساب المخوّل لتفعيل منتهٍ يستطيع فتح تاريخ قديم فقط ما دام في ذلك اليوم موظف ينتظر الكشف.
create or replace function app.manual_att_can_complete_pending(p_activation uuid, p_date date) returns boolean
language sql stable security definer set search_path = public, app as $$
  select auth.uid() is not null
     and exists (
       select 1
         from public.attendance_manual_activations a
        where a.id = p_activation
          and a.status = 'ended'
          and app.manual_att_can_record(a.id)
          and exists (select 1 from app.manual_att_pending_days(p_date, p_date, a.id))
     )
$$;

-- رابط الكشف في بوابة التفعيل نفسها بعد ثبوت دورها؛ غرفة العمليات تستخدم بوابتها الافتراضية.
create or replace function app.manual_att_user_link(p_user uuid, p_activation uuid) returns text
language sql stable security definer set search_path = public, app as $$
  select case
    when exists (select 1 from public.user_roles ur where ur.user_id = p_user and ur.role = 'ops_room')
      and app.can(p_user, 'ops-room.manual-attendance', 'view')
      and app.can(p_user, 'ops-room.manual-attendance', 'create')
      then '/ops-room/manual-attendance'
    else (
      select '/' || a.portal || '/manual-attendance'
        from public.attendance_manual_activations a
       where a.id = p_activation
         and exists (
           select 1
             from public.user_roles ur
             join public.permission_portal_roles pr on pr.role = ur.role and pr.portal = a.portal
             join public.permission_units pu on pu.key = pr.portal || '.manual-attendance'
            where ur.user_id = p_user
         )
         and app.can(p_user, a.portal || '.manual-attendance', 'view')
         and app.can(p_user, a.portal || '.manual-attendance', 'create')
    ) end
$$;

-- لا نُفصح عن التفعيل لأصحاب البوابة/الأدوار غير المختارين؛ المستلمون هم غرفة العمليات والحسابات الممنوحة فقط.
create or replace function app.manual_att_notify(p_activation uuid, p_event text) returns void
language plpgsql security definer set search_path = public, app as $$
declare a public.attendance_manual_activations; r record; v_title text; v_body text; v_link text; v_scope text; v_label text;
begin
  select * into a from public.attendance_manual_activations where id = p_activation;
  if a.id is null then return; end if;
  v_label := app.manual_att_portal_label(a.portal);
  v_scope := app.manual_att_scope_label(a.branch_id, a.department_id, a.include_sub_departments);
  if p_event = 'on' then
    v_title := 'تفعيل الحضور اليدوي — ' || v_label;
    v_body := 'أُوقفت البصمة منطقياً لنطاق «' || v_scope || '» اعتباراً من ' || a.starts_on::text || ' وأُضيفت صفحة «الحضور اليدوي» للحسابات المخوّلة وغرفة العمليات. السبب: ' || a.reason;
  else
    v_title := 'إيقاف الحضور اليدوي — ' || v_label;
    v_body := 'عادت البصمة لنطاق «' || v_scope || '» بعد ' || a.ends_on::text || '. الأيام التي لم يُسجَّل كشفها تبقى بانتظار الكشف وتمنع اعتماد الحضورية حتى تكتمل.';
  end if;
  for r in
    select ur.user_id from public.user_roles ur where ur.role = 'ops_room'
    union
    select ar.user_id from public.attendance_manual_recorders ar where ar.activation_id = p_activation
  loop
    v_link := app.manual_att_user_link(r.user_id, p_activation);
    if v_link is not null then
      perform app.hr_notify(r.user_id, v_title, v_body, v_link, 'att_manual_' || p_event || ':' || a.id::text, 'warning');
    end if;
  end loop;
end$$;

-- التذكير اليومي يذهب للمخولين فقط، بما فيهم غرفة العمليات.
create or replace function app.manual_att_remind() returns int
language plpgsql security definer set search_path = public, app as $$
declare a record; r record; v_n int; v_total int := 0; v_today date := app.hr_local_date(now()); v_link text;
begin
  for a in select * from public.attendance_manual_activations x where x.status = 'active' or x.ends_on >= v_today - 31 loop
    select count(*) into v_n from app.manual_att_pending_days(a.starts_on, least(coalesce(a.ends_on, v_today), v_today - 1), a.id);
    continue when v_n = 0;
    for r in
      select ur.user_id from public.user_roles ur where ur.role = 'ops_room'
      union
      select ar.user_id from public.attendance_manual_recorders ar where ar.activation_id = a.id
    loop
      v_link := app.manual_att_user_link(r.user_id, a.id);
      if v_link is not null then
        perform app.hr_notify(r.user_id, 'كشف حضور يدوي ناقص — ' || app.manual_att_portal_label(a.portal),
          v_n || ' يوم/موظف بلا كشف في نطاق «' || app.manual_att_scope_label(a.branch_id, a.department_id, a.include_sub_departments) || '». لا يُعتمد حضور الشهر قبل اكتماله.',
          v_link, 'att_manual_rem:' || a.id::text || ':' || v_today::text, 'warning');
        v_total := v_total + 1;
      end if;
    end loop;
  end loop;
  return v_total;
end$$;

-- واجهة IT لعرض الحسابات الممنوحة لتفعيل (لا تعرضها لباقي الحسابات).
create or replace function public.attendance_manual_recorders_get(p_activation uuid) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare out jsonb;
begin
  if auth.uid() is null or not app.has_role(array['it_admin']) then raise exception 'PERMISSION_DENIED'; end if;
  perform app.require_can('it.integrations.attendance-manual', 'view');
  if not exists (select 1 from public.attendance_manual_activations a where a.id = p_activation) then raise exception 'ATT_MANUAL_NOT_FOUND'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'user_id', r.user_id,
      'name', coalesce(nullif(e.full_name, ''), nullif(u.email, ''), r.user_id::text),
      'email', u.email,
      'roles', coalesce(roles.roles, '[]'::jsonb),
      'granted_by_name', case when r.granted_by is null then null else app.user_display_name(r.granted_by) end,
      'granted_at', r.granted_at
    ) order by coalesce(e.full_name, u.email, r.user_id::text)), '[]'::jsonb)
    into out
    from public.attendance_manual_recorders r
    join auth.users u on u.id = r.user_id
    left join public.employees e on e.user_id = r.user_id
    left join lateral (select jsonb_agg(ur.role order by ur.role) as roles from public.user_roles ur where ur.user_id = r.user_id) roles on true
   where r.activation_id = p_activation;
  return out;
end$$;

-- استبدال قائمة المخوّلين بذريّة، مع تدقيق insert/delete، وحماية التفعيل من التزامن.
create or replace function app.attendance_manual_recorders_set__raw(p_activation uuid, p_user_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare a public.attendance_manual_activations; ids uuid[] := coalesce(p_user_ids, '{}'::uuid[]); n int; v_pending int;
begin
  if auth.uid() is null or not app.has_role(array['it_admin']) then raise exception 'PERMISSION_DENIED'; end if;
  perform app.require_can('it.integrations.attendance-manual', 'execute');
  select * into a from public.attendance_manual_activations where id = p_activation for update;
  if a.id is null then raise exception 'ATT_MANUAL_NOT_FOUND'; end if;
  if cardinality(ids) > 5 then raise exception 'ATT_MANUAL_RECORDERS_TOO_MANY'; end if;
  if exists (select 1 from unnest(ids) u where u is null) then raise exception 'ATT_MANUAL_RECORDER_INVALID'; end if;
  select count(*), count(distinct u) into n, v_pending from unnest(ids) u;
  if n <> v_pending then raise exception 'ATT_MANUAL_RECORDER_DUPLICATE'; end if;
  if exists (select 1 from unnest(ids) u where not exists (select 1 from auth.users au where au.id = u)) then
    raise exception 'ATT_MANUAL_RECORDER_INVALID';
  end if;
  if exists (
    select 1
      from unnest(ids) selected(user_id)
     where not (
       (
         exists (select 1 from public.user_roles ur where ur.user_id = selected.user_id and ur.role = 'ops_room')
         and app.can(selected.user_id, 'ops-room.manual-attendance', 'view')
         and app.can(selected.user_id, 'ops-room.manual-attendance', 'create')
       )
       or (
         exists (
           select 1
             from public.user_roles ur
             join public.permission_portal_roles pr on pr.role = ur.role and pr.portal = a.portal
             join public.permission_units pu on pu.key = pr.portal || '.manual-attendance'
            where ur.user_id = selected.user_id
         )
         and app.can(selected.user_id, a.portal || '.manual-attendance', 'view')
         and app.can(selected.user_id, a.portal || '.manual-attendance', 'create')
       )
     )
  ) then raise exception 'ATT_MANUAL_RECORDER_PORTAL_ROLE_REQUIRED'; end if;
  if a.status = 'ended' then
    select count(*) into v_pending from app.manual_att_pending_days(a.starts_on, least(a.ends_on, app.hr_local_date(now())), a.id);
    if v_pending = 0 then raise exception 'ATT_MANUAL_NO_PENDING'; end if;
  end if;
  delete from public.attendance_manual_recorders r
   where r.activation_id = a.id and not (r.user_id = any(ids));
  insert into public.attendance_manual_recorders (activation_id, user_id, granted_by)
    select a.id, u, auth.uid() from unnest(ids) u
    on conflict (activation_id, user_id) do nothing;
  return jsonb_build_object('activation_id', a.id, 'recorders', cardinality(ids));
end$$;

-- Overload واحد للتفعيل يكتب التفعيل وقائمة الحسابات في المعاملة نفسها.
-- التوقيع القديم يبقى آمناً: لا يضيف حساباً آخر، وغرفة العمليات تبقى الافتراضية.
create or replace function public.attendance_manual_activate(
  p_portal text, p_branch uuid, p_department uuid, p_include_sub boolean, p_reason text, p_starts_on date, p_recorders uuid[]
) returns jsonb language plpgsql security definer set search_path = public, app as $$
declare result jsonb; v_activation uuid;
begin
  perform app.guard_duplicate('attendance_manual_activate', jsonb_build_object(
    'p_portal', p_portal, 'p_branch', p_branch, 'p_department', p_department, 'p_include_sub', p_include_sub,
    'p_reason', p_reason, 'p_starts_on', p_starts_on, 'p_recorders', p_recorders));
  result := app.attendance_manual_activate__raw(p_portal, p_branch, p_department, p_include_sub, p_reason, p_starts_on);
  v_activation := (result ->> 'id')::uuid;
  perform app.attendance_manual_recorders_set__raw(v_activation, p_recorders);
  -- raw activation notified the default ops-room accounts; this second pass adds the selected accounts (deduped per user).
  perform app.manual_att_notify(v_activation, 'on');
  return result;
end$$;

create or replace function public.attendance_manual_recorders_set(p_activation uuid, p_user_ids uuid[] default '{}'::uuid[]) returns jsonb
language plpgsql security definer set search_path = public, app as $$
begin
  perform app.guard_duplicate('attendance_manual_recorders_set', jsonb_build_object('p_activation', p_activation, 'p_user_ids', p_user_ids));
  perform app.guard_record_lock(p_activation);
  return app.attendance_manual_recorders_set__raw(p_activation, p_user_ids);
end$$;

-- صلاحية الكشف في الواجهات الخاصة تتحقق بمعرّف التفعيل لا ببوابته؛ الحساب المخوّل يكمل التاريخ الأقدم المعلّق بعد الإيقاف.
do $patch$
declare f regprocedure; def text; changed text; anchor text; replacement text;
begin
  foreach f in array array[
    'app.manual_att_sheet_save__raw(uuid,date,jsonb,text)'::regprocedure,
    'public.manual_att_sheet_get(uuid,date)'::regprocedure,
    'public.manual_att_my_activations()'::regprocedure
  ] loop
    def := pg_get_functiondef(f);
    changed := replace(def, 'app.manual_att_can_record(a.portal)', 'app.manual_att_can_record(a.id)');
    if changed = def then raise exception 'ATT_MANUAL_PATCH: صلاحية التفعيل غير موجودة في %', f; end if;

    if f = 'app.manual_att_sheet_save__raw(uuid,date,jsonb,text)'::regprocedure then
      anchor := $a$if v_missing > 0 then raise exception 'ATT_MANUAL_EMPLOYEE_NOT_IN_SCOPE'; end if;$a$;
      if position(anchor in changed) = 0 then raise exception 'ATT_MANUAL_PATCH: موضع التحقق من النطاق غير موجود'; end if;
      changed := replace(changed, anchor, anchor || E'\n  if exists (select 1 from jsonb_array_elements(p_entries) e join app.manual_att_sheet_rows(p_activation, p_date) rw on rw.employee_id = (e ->> ''employee_id'')::uuid where rw.state = ''no_shift'') then raise exception ''ATT_MANUAL_SHIFT_REQUIRED''; end if;');

      anchor := $a$if not app.manual_att_is_senior() and p_date < today - app.hr_policy_int('backdated_max_days', 7) then raise exception 'ATT_MANUAL_WINDOW_CLOSED'; end if;$a$;
      if position(anchor in changed) = 0 then raise exception 'ATT_MANUAL_PATCH: قيد الأيام السابقة غير موجود'; end if;
      changed := replace(changed, anchor, $r$if p_date < today - app.hr_policy_int('backdated_max_days', 7)
     and not app.manual_att_is_senior()
     and not app.manual_att_can_complete_pending(p_activation, p_date)
  then raise exception 'ATT_MANUAL_WINDOW_CLOSED'; end if;$r$);

      anchor := $a$if v_locked > 0 then raise exception 'ATT_MANUAL_EMPLOYEE_LOCKED: %', v_locked_name; end if;$a$;
      if position(anchor in changed) = 0 then raise exception 'ATT_MANUAL_PATCH: موضع التحقق من الصف المقفل غير موجود'; end if;
      replacement := anchor || E'\n  if p_date < today - app.hr_policy_int(''backdated_max_days'', 7) and not app.manual_att_is_senior() then\n    if a.status <> ''ended'' or exists (\n      select 1 from jsonb_array_elements(p_entries) e\n      join app.manual_att_sheet_rows(p_activation, p_date) rw on rw.employee_id = (e ->> ''employee_id'')::uuid\n      where not ((rw.state = ''open'' and rw.entry is null)\n        or (rw.state = ''other'' and rw.existing_source = ''manual'' and app.manual_att_can_review()))\n    ) then raise exception ''ATT_MANUAL_WINDOW_CLOSED''; end if;\n  end if;';
      changed := replace(changed, anchor, replacement);

    elsif f = 'public.manual_att_sheet_get(uuid,date)'::regprocedure then
      anchor := $a$v_senior boolean := app.manual_att_is_senior();$a$;
      if position(anchor in changed) = 0 then raise exception 'ATT_MANUAL_PATCH: متغير نافذة التاريخ غير موجود'; end if;
      changed := replace(changed, anchor, 'v_senior boolean; v_recent_from date; v_pending_from date;');

      anchor := $a$if not app.manual_att_can_record(a.id) then raise exception 'PERMISSION_DENIED'; end if;$a$;
      if position(anchor in changed) = 0 then raise exception 'ATT_MANUAL_PATCH: حارس التفعيل غير موجود'; end if;
      changed := replace(changed, anchor, anchor || E'\n  v_senior := app.manual_att_is_senior();');

      anchor := $a$v_from := greatest(case when v_senior then a.starts_on else greatest(a.starts_on, today - app.hr_policy_int('backdated_max_days', 7)) end, v_to - 61);$a$;
      if position(anchor in changed) = 0 then raise exception 'ATT_MANUAL_PATCH: حساب نافذة العرض غير موجود'; end if;
      replacement := $r$v_recent_from := greatest(case when a.status = 'ended' or v_senior then a.starts_on else greatest(a.starts_on, today - app.hr_policy_int('backdated_max_days', 7)) end, v_to - 61);
  v_from := v_recent_from;
  if a.status = 'ended' then
    select min(p.work_date) into v_pending_from from app.manual_att_pending_days(a.starts_on, v_to, a.id) p;
    if v_pending_from is not null then v_from := least(v_from, v_pending_from); end if;
  end if;$r$;
      changed := replace(changed, anchor, replacement);

      anchor := $a$if v_date < v_from or v_date > v_to then raise exception 'ATT_MANUAL_DATE_OUT_OF_RANGE'; end if;$a$;
      if position(anchor in changed) = 0 then raise exception 'ATT_MANUAL_PATCH: فحص تاريخ الكشف غير موجود'; end if;
      changed := replace(changed, anchor, anchor || E'\n    if a.status = ''ended'' and v_date < v_recent_from and not app.manual_att_can_complete_pending(a.id, v_date) then raise exception ''ATT_MANUAL_DATE_OUT_OF_RANGE''; end if;');

      anchor := $a$for d in select g::date from generate_series(v_to::timestamp, v_from::timestamp, interval '-1 day') g loop$a$;
      if position(anchor in changed) = 0 then raise exception 'ATT_MANUAL_PATCH: حلقة أيام الكشف غير موجودة'; end if;
      replacement := $r$for d in
      select days.work_date
        from (
          select g::date as work_date
            from generate_series(v_to::timestamp, v_recent_from::timestamp, interval '-1 day') g
          union
          select distinct p.work_date
            from app.manual_att_pending_days(a.starts_on, v_to, a.id) p
           where a.status = 'ended' and p.work_date < v_recent_from
        ) days
       order by days.work_date desc
      loop$r$;
      changed := replace(changed, anchor, replacement);
    end if;

    execute changed;
  end loop;
end $patch$;

-- الدالة القديمة حسب البوابة لم تعد مصدر صلاحية لأي بوابة؛ التنفيذ الفعلي يجري بالـ UUID أعلاه.
revoke all on function app.manual_att_can_record(text), app.manual_att_can_record(uuid), app.manual_att_can_complete_pending(uuid, date), app.manual_att_user_link(uuid, uuid), app.attendance_manual_recorders_set__raw(uuid, uuid[])
  from public, anon, authenticated;
revoke all on function public.attendance_manual_activate(text, uuid, uuid, boolean, text, date, uuid[]),
  public.attendance_manual_recorders_get(uuid), public.attendance_manual_recorders_set(uuid, uuid[]) from public, anon;
grant execute on function public.attendance_manual_activate(text, uuid, uuid, boolean, text, date, uuid[]),
  public.attendance_manual_recorders_get(uuid), public.attendance_manual_recorders_set(uuid, uuid[]) to authenticated;


