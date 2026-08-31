-- ═══════════════════════════════════════════════════════════════
-- 00040 · وحدة الكشوفات (disclosures_officer)
--   · دور جديد: disclosures_officer (وحدة الكشوفات)
--   · جدول disclosures: كشف تأديبي (إنذار/توبيخ/إنهاء خدمة) بمخالفة
--     (تأخير/غياب/جباية/تهرب من العمل)
--   · الحالة: draft → submitted_to_deputy (مرفوع لمعاون المدير المفوض)
--   · الحذف = أرشفة لأرشيف IT (لا حذف فعلي) + تنبيه IT
--   · رفع الكشف ينبّه معاون المدير المفوض (deputy_director)
--   · RLS: وحدة الكشوفات تدير نشيطها · deputy/executive يقرأون المرفوع
--     · IT تقرأ/تستعيد المؤرشف
-- ═══════════════════════════════════════════════════════════════

-- ① تسجيل الدور في قيد user_roles
alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check
  check (role in (
    'employee', 'hr_officer', 'department_manager',
    'finance_officer', 'it_admin', 'super_admin',
    'field_ops', 'admin_ops', 'maintenance', 'transfer_station',
    'executive_director', 'deputy_director', 'ops_room',
    'disclosures_officer'));

-- ② تحديث أولوية الدور في JWT Hook
create or replace function app.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  claims    jsonb;
  user_role text;
begin
  select role into user_role
  from public.user_roles
  where user_id = (event ->> 'user_id')::uuid
  order by array_position(array[
    'super_admin', 'it_admin', 'executive_director', 'deputy_director',
    'ops_room', 'finance_officer', 'hr_officer', 'admin_ops',
    'field_ops', 'maintenance', 'transfer_station', 'disclosures_officer',
    'department_manager', 'employee'
  ], role)
  limit 1;

  claims = coalesce(event -> 'claims', '{}'::jsonb);
  claims = jsonb_set(claims, '{role}', to_jsonb(coalesce(user_role, 'employee')));

  return jsonb_set(event, '{claims}', claims);
end;
$$;

revoke all on function app.custom_access_token_hook from public, anon, authenticated;
grant execute on function app.custom_access_token_hook to supabase_auth_admin;

-- ═══ جدول الكشوفات ═══
create table if not exists public.disclosures (
  id              uuid primary key default gen_random_uuid(),
  ref_no          text,                          -- م/كشف رقم

  -- البيانات الأساسية (حسب النموذج المرفق)
  db_number       text not null,                 -- DB (رقم الآلية)
  driver_name     text not null,                 -- اسم السائق
  vehicle_type    text,                          -- نوع الآلية
  contractor_name text,                          -- اسم المتعهد
  sector          text,                          -- القاطع
  shift           text default 'morning' check (shift in ('morning','evening')),
  log_date        date not null default current_date,   -- التاريخ (ذاتي)

  -- نوع الكشف: المخالفة + الإجراء التأديبي
  violation_type  text not null check (violation_type in
                    ('delay','absence','collection','evasion')),
  penalty_type    text check (penalty_type in ('warning','reprimand','termination')),
  details         text not null,                 -- تفاصيل الكشف

  -- الرفع لمعاون المدير المفوض
  status          text not null default 'draft'
                    check (status in ('draft','submitted_to_deputy')),
  submitted_at    timestamptz,

  -- مُعدّ الكشف
  prepared_by_name text,                         -- اسم منظم الكشف

  -- الأرشفة (نقل لأرشيف IT)
  archived_at     timestamptz,
  archived_by     uuid references auth.users (id),
  archive_reason  text,

  created_by      uuid references auth.users (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_disclosures_status   on public.disclosures (status) where status = 'submitted_to_deputy';
create index idx_disclosures_date     on public.disclosures (log_date desc);
create index idx_disclosures_archived on public.disclosures (archived_at) where archived_at is not null;
create index idx_disclosures_violation on public.disclosures (violation_type);

alter table public.disclosures enable row level security;

-- قراءة النشط: وحدة الكشوفات + المعاون + المدير التنفيذي + غرفة العمليات
drop policy if exists "disclosures: قراءة النشط" on public.disclosures;
create policy "disclosures: قراءة النشط" on public.disclosures
  for select to authenticated
  using (
    archived_at is null
    and app.has_role(array['disclosures_officer','deputy_director','executive_director',
                           'ops_room','super_admin'])
  );

-- قراءة المؤرشف: IT والمدير المفوض
drop policy if exists "disclosures: قراءة المؤرشف" on public.disclosures;
create policy "disclosures: قراءة المؤرشف" on public.disclosures
  for select to authenticated
  using (
    archived_at is not null
    and app.has_role(array['it_admin','super_admin'])
  );

-- إنشاء/تعديل: وحدة الكشوفات فقط
drop policy if exists "disclosures: كتابة الوحدة" on public.disclosures;
create policy "disclosures: كتابة الوحدة" on public.disclosures
  for insert to authenticated
  with check (app.has_role(array['disclosures_officer','super_admin']));

drop policy if exists "disclosures: تعديل الوحدة" on public.disclosures;
create policy "disclosures: تعديل الوحدة" on public.disclosures
  for update to authenticated
  using      (app.has_role(array['disclosures_officer','super_admin']))
  with check (app.has_role(array['disclosures_officer','super_admin']));

-- لا حذف فعلي
drop policy if exists "disclosures: منع الحذف" on public.disclosures;
create policy "disclosures: منع الحذف" on public.disclosures
  for delete to authenticated
  using (false);

create or replace function app.disclosures_touch()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists trg_disclosures_touch on public.disclosures;
create trigger trg_disclosures_touch before update on public.disclosures
  for each row execute function app.disclosures_touch();

-- ═══ ① أرشفة كشف (حذف → أرشيف IT + تنبيه) ═══
create or replace function app.disclosure_archive(p_id text, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public, app
as $$
declare v_ref text; v_driver text;
begin
  if not app.has_role(array['disclosures_officer','super_admin']) then
    raise exception 'ARCHIVE_FORBIDDEN: الأرشفة من وحدة الكشوفات حصراً';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'REASON_REQUIRED: سبب الأرشفة مطلوب';
  end if;

  select ref_no, driver_name into v_ref, v_driver
  from public.disclosures where id = p_id::uuid and archived_at is null;
  if not found then
    raise exception 'RECORD_NOT_FOUND: الكشف غير موجود أو مؤرشف مسبقاً';
  end if;

  update public.disclosures
  set archived_at = now(), archived_by = auth.uid(), archive_reason = p_reason,
      status = 'draft', submitted_at = null
  where id = p_id::uuid and archived_at is null;

  insert into public.audit_logs (table_name, record_id, operation, new_row, actor_id, actor_role)
  values ('disclosures', p_id, 'ARCHIVE',
          jsonb_build_object('reason', p_reason, 'ref', v_ref, 'driver', v_driver),
          auth.uid(), app.current_role());

  perform app.notify_by_role(
    array['it_admin','super_admin'],
    'كشف مؤرشف من وحدة الكشوفات',
    format('كشف (%s | %s) نُقل للأرشيف المركزي. السبب: %s', coalesce(v_ref,'—'), v_driver, p_reason),
    'warning', '/it/archive');
  return true;
end; $$;

-- ═══ ② استعادة كشف من أرشيف IT ═══
create or replace function app.disclosure_restore(p_id text)
returns boolean
language plpgsql
security definer
set search_path = public, app
as $$
begin
  if not app.has_role(array['it_admin','super_admin']) then
    raise exception 'RESTORE_FORBIDDEN: الاستعادة من أرشيف IT حصراً';
  end if;

  update public.disclosures
  set archived_at = null, archived_by = null, archive_reason = null
  where id = p_id::uuid and archived_at is not null;
  if not found then
    raise exception 'RECORD_NOT_FOUND: لا يوجد كشف مؤرشف بهذا المعرف';
  end if;

  insert into public.audit_logs (table_name, record_id, operation, actor_id, actor_role)
  values ('disclosures', p_id, 'RESTORE', auth.uid(), app.current_role());

  perform app.notify_by_role(
    array['disclosures_officer','super_admin'],
    'تمت استعادة كشف',
    format('أُعيد الكشف %s من الأرشيف المركزي إلى وحدة الكشوفات.', p_id),
    'success', '/disclosures/archive');
  return true;
end; $$;

-- ═══ ③ رفع كشف لمعاون المدير المفوض ═══
create or replace function app.disclosure_submit(p_id text)
returns boolean
language plpgsql
security definer
set search_path = public, app
as $$
declare v_ref text; v_driver text; v_violation text;
begin
  if not app.has_role(array['disclosures_officer','super_admin']) then
    raise exception 'SUBMIT_FORBIDDEN: الرفع من وحدة الكشوفات حصراً';
  end if;

  update public.disclosures
  set status = 'submitted_to_deputy', submitted_at = now()
  where id = p_id::uuid and archived_at is null and status = 'draft'
  returning ref_no, driver_name, violation_type into v_ref, v_driver, v_violation;

  if not found then
    raise exception 'RECORD_NOT_FOUND: الكشف غير قابل للرفع';
  end if;

  insert into public.audit_logs (table_name, record_id, operation, new_row, actor_id, actor_role)
  values ('disclosures', p_id, 'SUBMIT_TO_DEPUTY',
          jsonb_build_object('ref', v_ref, 'driver', v_driver),
          auth.uid(), app.current_role());

  perform app.notify_by_role(
    array['deputy_director','super_admin'],
    'كشف جديد للاعتماد — وحدة الكشوفات',
    format('وصل كشف (%s | السائق: %s) للاعتماد.', coalesce(v_ref,'—'), v_driver),
    'info', '/deputy/statements');
  return true;
end; $$;

-- ═══ ④ ملخص إحصائي للوحة الرئيسية ═══
create or replace function app.disclosure_summary()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not app.has_role(array['disclosures_officer','deputy_director','executive_director',
                                'ops_room','super_admin']) then '{}'::jsonb
    else (
      select jsonb_build_object(
        'total',        count(*) filter (where archived_at is null),
        'drafts',       count(*) filter (where status='draft' and archived_at is null),
        'submitted',    count(*) filter (where status='submitted_to_deputy' and archived_at is null),
        'archived',     count(*) filter (where archived_at is not null),
        'today',        count(*) filter (where log_date = current_date and archived_at is null),
        'by_violation', jsonb_build_object(
          'delay',      count(*) filter (where violation_type='delay' and archived_at is null),
          'absence',    count(*) filter (where violation_type='absence' and archived_at is null),
          'collection', count(*) filter (where violation_type='collection' and archived_at is null),
          'evasion',    count(*) filter (where violation_type='evasion' and archived_at is null)
        )
      )
      from public.disclosures
    )
  end;
$$;

revoke all on function app.disclosure_archive(text,text) from public, anon, authenticated;
revoke all on function app.disclosure_restore(text)      from public, anon, authenticated;
revoke all on function app.disclosure_submit(text)       from public, anon, authenticated;
revoke all on function app.disclosure_summary()          from public, anon, authenticated;
grant execute on function app.disclosure_archive(text,text) to authenticated;
grant execute on function app.disclosure_restore(text)      to authenticated;
grant execute on function app.disclosure_submit(text)       to authenticated;
grant execute on function app.disclosure_summary()          to authenticated;
