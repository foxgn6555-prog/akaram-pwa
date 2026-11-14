-- V-36 — الأدوار الحساسة لا تُمنح ولا تُسحب إلا بموافقة المدير المفوض
-- ─────────────────────────────────────────────────────────────────────────────
-- القرار (المستخدم، الجولة 8ب): أي منح/سحب لأحد الأدوار الأربعة
--   it_admin · super_admin · finance_officer · deputy_director
-- لا يُنفَّذ مباشرةً؛ يُنشأ طلب يظهر في /admin/approvals عند المدير المفوض،
-- ولا يتغيّر أي دور قبل موافقته. ويُسجَّل الطلب والمانح والمعتمِد ووقت كل خطوة.
--
-- القاعدة: المحرك القائم (approval_tasks + approval_decide) يُعاد استخدامه بالكامل —
-- لا محرك جديد، ولا تغيير في أي مسار موافقات قائم.
-- ─────────────────────────────────────────────────────────────────────────────

-- ⓪ القيد على أنواع مهام الموافقة: إضافة النوع الجديد role_grant
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.approval_tasks'::regclass
      and conname = 'approval_tasks_request_kind_check'
      and pg_get_constraintdef(oid) not like '%role_grant%'
  ) then
    alter table public.approval_tasks drop constraint approval_tasks_request_kind_check;
    alter table public.approval_tasks add constraint approval_tasks_request_kind_check check (
      request_kind = any (array['leave','time_permit','supplies','termination','disclosure','advance',
        'cold_archive_purge','complaint_report','hire','attendance_edit','platform_reset','role_grant']));
  end if;
end $$;

-- ① جدول الطلبات
create table if not exists public.role_grant_requests (
  id uuid primary key default gen_random_uuid(),
  target_user uuid not null,
  role text not null,
  is_grant boolean not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  requested_by uuid not null,
  requested_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  note text
);

create unique index if not exists role_grant_requests_pending_uniq
  on public.role_grant_requests (target_user, role, is_grant) where status = 'pending';
create index if not exists role_grant_requests_target_idx
  on public.role_grant_requests (target_user, requested_at desc);

alter table public.role_grant_requests enable row level security;

drop policy if exists "role_grant_requests: قراءة للتطوير والمدير المفوض" on public.role_grant_requests;
create policy "role_grant_requests: قراءة للتطوير والمدير المفوض" on public.role_grant_requests
  for select using (app.has_role(array['it_admin', 'super_admin']) or requested_by = auth.uid());
-- لا سياسات INSERT/UPDATE/DELETE: الكتابة عبر الدوال المحمية فقط.

-- ② قراءة الطلبات في الواجهة
create or replace function public.role_grant_requests_list(p_user_id uuid default null)
returns table (
  id uuid, target_user uuid, target_email text, target_name text,
  role text, role_label text, is_grant boolean, status text,
  requested_by uuid, requested_by_name text, requested_at timestamptz,
  decided_by uuid, decided_at timestamptz, note text
)
language sql stable security definer set search_path to 'public', 'app' as $$
  select r.id, r.target_user, u.email::text, app.user_display_name(r.target_user),
         r.role, app.approval_role_label(r.role), r.is_grant, r.status,
         r.requested_by, app.user_display_name(r.requested_by), r.requested_at,
         r.decided_by, r.decided_at, r.note
  from public.role_grant_requests r
  left join auth.users u on u.id = r.target_user
  where (p_user_id is null or r.target_user = p_user_id)
    and (app.has_role(array['it_admin', 'super_admin']) or r.requested_by = auth.uid())
  order by r.requested_at desc
  limit 200;
$$;
grant execute on function public.role_grant_requests_list(uuid) to authenticated;

-- ③ بوابة الطلب داخل app.set_user_role + مسار معتمَد للمدير المفوض
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('app.set_user_role(uuid,text,boolean,uuid)'::regprocedure);
  if position('ROLE_GRANT_NO_APPROVER' in v_def) > 0 then
    raise notice 'V-36 gate already applied'; return;
  end if;

  -- (أ) المدير المفوض يعتمد عبر مسار مسجّل: يُسمح له بالتنفيذ بعد الموافقة
  v_def := replace(v_def,
    'if not v_is_it and not exists (select 1 from public.user_roles where user_id = v_actor and role = ''hr_officer'') then',
    'if not v_is_it and coalesce(current_setting(''app.role_grant_approved'', true), '''') <> ''on'' and not exists (select 1 from public.user_roles where user_id = v_actor and role = ''hr_officer'') then');

  -- (ب) إسناد الأدوار الإدارية يبقى للتطوير، ما لم يكن التنفيذ بموافقة موثّقة
  v_def := replace(v_def,
    'if p_role in (''it_admin'', ''super_admin'') and not v_is_it then',
    'if p_role in (''it_admin'', ''super_admin'') and not v_is_it and coalesce(current_setting(''app.role_grant_approved'', true), '''') <> ''on'' then');

  -- (ج) البوابة: الأدوار الحساسة ⇒ طلب موافقة، بلا أي تغيير فوري
  v_def := replace(v_def,
    '  if p_grant then' || chr(10) || '    insert into public.user_roles (user_id, role, granted_by)',
    '  -- V-36: الأدوار الحساسة لا تُمنح/تُسحب إلا بموافقة المدير المفوض' || chr(10) ||
    '  if p_role in (''it_admin'', ''super_admin'', ''finance_officer'', ''deputy_director'')' || chr(10) ||
    '     and coalesce(current_setting(''app.role_grant_approved'', true), '''') <> ''on''' || chr(10) ||
    '     and not exists (select 1 from public.user_roles ur where ur.user_id = v_actor and ur.role = ''super_admin'') then' || chr(10) ||
    '    if not exists (select 1 from public.user_roles where role = ''super_admin'') then' || chr(10) ||
    '      raise exception ''ROLE_GRANT_NO_APPROVER: لا يوجد مدير مفوض لاعتماد منح أو سحب الأدوار الحساسة'';' || chr(10) ||
    '    end if;' || chr(10) ||
    '    insert into public.role_grant_requests (target_user, role, is_grant, requested_by)' || chr(10) ||
    '    values (p_user_id, p_role, p_grant, v_actor)' || chr(10) ||
    '    on conflict (target_user, role, is_grant) where status = ''pending'' do nothing;' || chr(10) ||
    '    insert into public.approval_tasks (request_kind, request_id, chain_id, step_no, step_label, approvers, status, note)' || chr(10) ||
    '    select ''role_grant'', r.id, null, 1, ''المدير المفوض'',' || chr(10) ||
    '           (select array_agg(ur2.user_id) from public.user_roles ur2 where ur2.role = ''super_admin''),' || chr(10) ||
    '           ''pending'', (case when r.is_grant then ''منح دور '' else ''سحب دور '' end) || r.role || '' إلى '' || coalesce(app.user_display_name(r.target_user), ''—'')' || chr(10) ||
    '    from public.role_grant_requests r' || chr(10) ||
    '    where r.target_user = p_user_id and r.role = p_role and r.is_grant = p_grant and r.status = ''pending''' || chr(10) ||
    '      and not exists (select 1 from public.approval_tasks t where t.request_kind = ''role_grant'' and t.request_id = r.id and t.status = ''pending'');' || chr(10) ||
    '    insert into public.audit_logs (table_name, record_id, operation, new_row, actor_id, actor_role)' || chr(10) ||
    '    values (''user_roles'', p_user_id::text, ''UPDATE'', || chr(10) ||
    '            jsonb_build_object(''role'', p_role, ''granted'', p_grant, ''awaiting_approval'', true), v_actor, app.current_role());' || chr(10) ||
    '    return;' || chr(10) ||
    '  end if;' || chr(10) ||
    '  if p_grant then' || chr(10) || '    insert into public.user_roles (user_id, role, granted_by)');

  execute v_def;
end $$;

-- ④ تنفيذ الطلب بعد قرار المدير المفوض
create or replace function public.role_grant_decide(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path to 'public', 'app' as $$
declare r public.role_grant_requests; me uuid := auth.uid();
begin
  perform app.guard_duplicate('role_grant_decide', jsonb_build_object('p_id', p_id, 'p_approve', p_approve, 'p_note', p_note));
  select * into r from public.role_grant_requests where id = p_id for update;
  if r.id is null then raise exception 'ROLE_GRANT_NOT_FOUND'; end if;
  if r.status <> 'pending' then raise exception 'ROLE_GRANT_NOT_PENDING'; end if;
  if not app.has_role(array['super_admin']) then raise exception 'ROLE_GRANT_FORBIDDEN'; end if;

  perform app.approval_decide('role_grant', p_id, p_approve, p_note);

  if p_approve then
    perform set_config('app.role_grant_approved', 'on', true);
    perform app.set_user_role(r.target_user, r.role, r.is_grant, me);
    perform set_config('app.role_grant_approved', 'off', true);
    update public.role_grant_requests
       set status = 'approved', decided_by = me, decided_at = now(),
           note = coalesce(nullif(trim(coalesce(p_note, '')), ''), note)
     where id = p_id;
    perform app.hr_notify(r.requested_by, 'اعتُمد طلب منح/سحب دور حسّاس',
      (case when r.is_grant then 'منح ' else 'سحب ' end) || r.role || ' — ' || coalesce(app.user_display_name(r.target_user), '—'),
      '/it/user-management', 'role_grant_ok:' || r.id::text, 'success');
  else
    update public.role_grant_requests
       set status = 'rejected', decided_by = me, decided_at = now(),
           note = nullif(trim(coalesce(p_note, '')), '')
     where id = p_id;
    perform app.hr_notify(r.requested_by, 'رُفض طلب منح/سحب دور حسّاس',
      coalesce(nullif(trim(coalesce(p_note, '')), ''), r.role),
      '/it/user-management', 'role_grant_rej:' || r.id::text, 'warning');
  end if;
end $$;
grant execute on function public.role_grant_decide(uuid, boolean, text) to authenticated;

-- ⑤ وصل الطلب بالمحرك: قرار المدير المفوض يمر إلى role_grant_decide
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('app.approval_decide_request__raw(text,uuid,boolean,text)'::regprocedure);
  if position('role_grant' in v_def) > 0 then raise notice 'dispatch already wired'; return; end if;
  v_def := replace(v_def,
    '  else raise exception ''APPROVAL_TYPE_INVALID''; end if;',
    '  elsif p_kind = ''role_grant'' then perform public.role_grant_decide(p_request, p_approve, p_note);' || chr(10) ||
    '  else raise exception ''APPROVAL_TYPE_INVALID''; end if;');
  execute v_def;
end $$;

-- ⑥ اسم النوع في شاشة الموافقات
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('app.approval_kind_label(text)'::regprocedure);
  if position('role_grant' in v_def) > 0 then raise notice 'label already set'; return; end if;
  v_def := replace(v_def,
    'when ''platform_reset'' then ''تصفير المنصة'' else',
    'when ''platform_reset'' then ''تصفير المنصة'' when ''role_grant'' then ''منح / سحب دور حسّاس'' else');
  execute v_def;
end $$;

-- ⑦ ظهور الطلب في قائمة موافقات المدير المفوض (/admin/approvals)
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('app.approval_my_tasks_chain_00367()'::regprocedure);
  if position('role_grant_requests' in v_def) > 0 then raise notice 'task arm already wired'; return; end if;
  -- ملاحظة: نص الدالة مخزّن بنهايات أسطر CRLF، فالمرساة يجب أن تطابقها
  v_def := replace(v_def,
    chr(13) || chr(10) || '  )' || chr(13) || chr(10) || '  select b.id, b.request_kind, b.request_id, b.step_no,',
    chr(10) ||
    '    union all' || chr(10) ||
    '    -- V-36: طلبات منح/سحب الأدوار الحساسة' || chr(10) ||
    '    select t.*, q.requested_by, app.user_display_name(q.requested_by),' || chr(10) ||
    '      (case when q.is_grant then ''منح دور'' else ''سحب دور'' end) || '' · '' || app.approval_role_label(q.role),' || chr(10) ||
    '      q.requested_at::date, q.requested_at::date, null, null, null, null, q.note, null, q.requested_at, null, null,' || chr(10) ||
    '      jsonb_build_object(''role'', q.role, ''role_label'', app.approval_role_label(q.role), ''is_grant'', q.is_grant,' || chr(10) ||
    '                         ''target_email'', u.email, ''target_name'', app.user_display_name(q.target_user)), ''it_admin''' || chr(10) ||
    '    from public.approval_tasks t' || chr(10) ||
    '      join public.role_grant_requests q on q.id = t.request_id and t.request_kind = ''role_grant''' || chr(10) ||
    '      left join auth.users u on u.id = q.target_user' || chr(10) ||
    '    where t.status = ''pending'' and auth.uid() = any(t.approvers) and q.status = ''pending''' || chr(10) ||
    '  )' || chr(13) || chr(10) || '  select b.id, b.request_kind, b.request_id, b.step_no,');
  execute v_def;
end $$;
