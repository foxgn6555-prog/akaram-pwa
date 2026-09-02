-- ═══════════════════════════════════════════════════════════════
-- 00043 · المحطة التحويلية — السكسات الخارجة · النسافات الخارجة · الحضورية
--   · السكسات/النسافات: اسم السائق · نوع الآلية · وقت الخروج (تلقائي) · التاريخ
--     · نظام الفولدر الشهري: سجلات الشهر تُرسل دفعة واحدة لبوابة
--       معاون المدير المفوض (draft → submitted_to_deputy)
--   · الحضورية: اسم الموظف · حاضر/غير حاضر · التاريخ
--   · RLS: المحطة تكتب/تقرأ · المعاون يقرأ المُرسل · IT يقرأ المؤرشف
--   · أغلفة public للـ RPC مباشرة (درس 00042 — PostgREST يعرض public فقط)
-- ═══════════════════════════════════════════════════════════════

-- ── ① السكسات الخارجة ──
create table if not exists public.ts_saksat_records (
  id             uuid primary key default gen_random_uuid(),
  driver_name    text not null,
  vehicle_type   text,
  exit_time      timestamptz not null default now(),   -- وقت الخروج — تلقائي
  log_date       date not null default current_date,

  status         text not null default 'draft'
                   check (status in ('draft','submitted_to_deputy')),
  submitted_at   timestamptz,

  archived_at    timestamptz,
  archived_by    uuid references auth.users (id),
  archive_reason text,

  created_by     uuid references auth.users (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── ② النسافات الخارجة (بنفس بنية السكسات) ──
create table if not exists public.ts_trips_records (
  id             uuid primary key default gen_random_uuid(),
  driver_name    text not null,
  vehicle_type   text,
  exit_time      timestamptz not null default now(),
  log_date       date not null default current_date,

  status         text not null default 'draft'
                   check (status in ('draft','submitted_to_deputy')),
  submitted_at   timestamptz,

  archived_at    timestamptz,
  archived_by    uuid references auth.users (id),
  archive_reason text,

  created_by     uuid references auth.users (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── ③ الحضورية ──
create table if not exists public.ts_attendance_records (
  id             uuid primary key default gen_random_uuid(),
  employee_name  text not null,
  is_present     boolean not null default true,        -- حاضر / غير حاضر
  note           text,
  log_date       date not null default current_date,

  archived_at    timestamptz,
  archived_by    uuid references auth.users (id),
  archive_reason text,

  created_by     uuid references auth.users (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── الفهارس ──
create index if not exists idx_ts_saksat_date   on public.ts_saksat_records (log_date desc);
create index if not exists idx_ts_saksat_status on public.ts_saksat_records (status) where status = 'submitted_to_deputy';
create index if not exists idx_ts_trips_date    on public.ts_trips_records (log_date desc);
create index if not exists idx_ts_trips_status  on public.ts_trips_records (status) where status = 'submitted_to_deputy';
create index if not exists idx_ts_attend_date   on public.ts_attendance_records (log_date desc);

-- ── ④ RLS ──
alter table public.ts_saksat_records     enable row level security;
alter table public.ts_trips_records      enable row level security;
alter table public.ts_attendance_records enable row level security;

-- السكسات: قراءة النشط (المحطة + المعاون + المدير التنفيذي)
drop policy if exists "ts_saksat: قراءة النشط" on public.ts_saksat_records;
create policy "ts_saksat: قراءة النشط" on public.ts_saksat_records
  for select to authenticated
  using (
    archived_at is null
    and app.has_role(array['transfer_station','deputy_director',
                            'executive_director','super_admin'])
  );

drop policy if exists "ts_saksat: قراءة المؤرشف" on public.ts_saksat_records;
create policy "ts_saksat: قراءة المؤرشف" on public.ts_saksat_records
  for select to authenticated
  using (archived_at is not null and app.has_role(array['it_admin','super_admin']));

drop policy if exists "ts_saksat: كتابة المحطة" on public.ts_saksat_records;
create policy "ts_saksat: كتابة المحطة" on public.ts_saksat_records
  for insert to authenticated
  with check (app.has_role(array['transfer_station','super_admin']));

drop policy if exists "ts_saksat: تعديل المحطة" on public.ts_saksat_records;
create policy "ts_saksat: تعديل المحطة" on public.ts_saksat_records
  for update to authenticated
  using (app.has_role(array['transfer_station','super_admin']))
  with check (app.has_role(array['transfer_station','super_admin']));

drop policy if exists "ts_saksat: منع الحذف" on public.ts_saksat_records;
create policy "ts_saksat: منع الحذف" on public.ts_saksat_records
  for delete to authenticated using (false);

-- النسافات: نفس سياسات السكسات
drop policy if exists "ts_trips: قراءة النشط" on public.ts_trips_records;
create policy "ts_trips: قراءة النشط" on public.ts_trips_records
  for select to authenticated
  using (
    archived_at is null
    and app.has_role(array['transfer_station','deputy_director',
                            'executive_director','super_admin'])
  );

drop policy if exists "ts_trips: قراءة المؤرشف" on public.ts_trips_records;
create policy "ts_trips: قراءة المؤرشف" on public.ts_trips_records
  for select to authenticated
  using (archived_at is not null and app.has_role(array['it_admin','super_admin']));

drop policy if exists "ts_trips: كتابة المحطة" on public.ts_trips_records;
create policy "ts_trips: كتابة المحطة" on public.ts_trips_records
  for insert to authenticated
  with check (app.has_role(array['transfer_station','super_admin']));

drop policy if exists "ts_trips: تعديل المحطة" on public.ts_trips_records;
create policy "ts_trips: تعديل المحطة" on public.ts_trips_records
  for update to authenticated
  using (app.has_role(array['transfer_station','super_admin']))
  with check (app.has_role(array['transfer_station','super_admin']));

drop policy if exists "ts_trips: منع الحذف" on public.ts_trips_records;
create policy "ts_trips: منع الحذف" on public.ts_trips_records
  for delete to authenticated using (false);

-- الحضورية: المحطة فقط (+ قراءة IT للمؤرشف)
drop policy if exists "ts_attend: قراءة النشط" on public.ts_attendance_records;
create policy "ts_attend: قراءة النشط" on public.ts_attendance_records
  for select to authenticated
  using (
    archived_at is null
    and app.has_role(array['transfer_station','super_admin'])
  );

drop policy if exists "ts_attend: قراءة المؤرشف" on public.ts_attendance_records;
create policy "ts_attend: قراءة المؤرشف" on public.ts_attendance_records
  for select to authenticated
  using (archived_at is not null and app.has_role(array['it_admin','super_admin']));

drop policy if exists "ts_attend: كتابة المحطة" on public.ts_attendance_records;
create policy "ts_attend: كتابة المحطة" on public.ts_attendance_records
  for insert to authenticated
  with check (app.has_role(array['transfer_station','super_admin']));

drop policy if exists "ts_attend: تعديل المحطة" on public.ts_attendance_records;
create policy "ts_attend: تعديل المحطة" on public.ts_attendance_records
  for update to authenticated
  using (app.has_role(array['transfer_station','super_admin']))
  with check (app.has_role(array['transfer_station','super_admin']));

drop policy if exists "ts_attend: منع الحذف" on public.ts_attendance_records;
create policy "ts_attend: منع الحذف" on public.ts_attendance_records
  for delete to authenticated using (false);

-- ── تحديث updated_at تلقائياً ──
create or replace function app.ts_station_touch()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_ts_saksat_touch on public.ts_saksat_records;
create trigger trg_ts_saksat_touch before update on public.ts_saksat_records
  for each row execute function app.ts_station_touch();

drop trigger if exists trg_ts_trips_touch on public.ts_trips_records;
create trigger trg_ts_trips_touch before update on public.ts_trips_records
  for each row execute function app.ts_station_touch();

drop trigger if exists trg_ts_attend_touch on public.ts_attendance_records;
create trigger trg_ts_attend_touch before update on public.ts_attendance_records
  for each row execute function app.ts_station_touch();

-- ── ⑤ إرسال فولدر شهري — السكسات ──
create or replace function app.ts_saksat_send_folder(p_month text)
returns integer
language plpgsql
security definer
set search_path = public, app
as $$
declare v_count integer;
begin
  if not app.has_role(array['transfer_station','super_admin']) then
    raise exception 'SEND_FORBIDDEN: الإرسال من المحطة التحويلية حصراً';
  end if;
  if p_month !~ '^\d{4}-\d{2}$' then
    raise exception 'INVALID_MONTH: الشهر بصيغة YYYY-MM';
  end if;

  update public.ts_saksat_records
  set status = 'submitted_to_deputy', submitted_at = now()
  where to_char(log_date, 'YYYY-MM') = p_month
    and status = 'draft' and archived_at is null;

  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'FOLDER_EMPTY: لا توجد سجلات مسودة في فولدر هذا الشهر';
  end if;

  insert into public.audit_logs (table_name, record_id, operation, new_row, actor_id, actor_role)
  values ('ts_saksat_records', p_month, 'SEND_FOLDER_TO_DEPUTY',
          jsonb_build_object('month', p_month, 'count', v_count),
          auth.uid(), app.current_role());

  perform app.notify_by_role(
    array['deputy_director','super_admin'],
    'فولدر السكسات الخارجة — المحطة التحويلية',
    format('وصل فولدر السكسات الخارجة لشهر %s (%s سجل) للاطلاع.', p_month, v_count),
    'info', '/deputy/station-folders');
  return v_count;
end;
$$;

-- ── ⑥ إرسال فولدر شهري — النسافات ──
create or replace function app.ts_trips_send_folder(p_month text)
returns integer
language plpgsql
security definer
set search_path = public, app
as $$
declare v_count integer;
begin
  if not app.has_role(array['transfer_station','super_admin']) then
    raise exception 'SEND_FORBIDDEN: الإرسال من المحطة التحويلية حصراً';
  end if;
  if p_month !~ '^\d{4}-\d{2}$' then
    raise exception 'INVALID_MONTH: الشهر بصيغة YYYY-MM';
  end if;

  update public.ts_trips_records
  set status = 'submitted_to_deputy', submitted_at = now()
  where to_char(log_date, 'YYYY-MM') = p_month
    and status = 'draft' and archived_at is null;

  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'FOLDER_EMPTY: لا توجد سجلات مسودة في فولدر هذا الشهر';
  end if;

  insert into public.audit_logs (table_name, record_id, operation, new_row, actor_id, actor_role)
  values ('ts_trips_records', p_month, 'SEND_FOLDER_TO_DEPUTY',
          jsonb_build_object('month', p_month, 'count', v_count),
          auth.uid(), app.current_role());

  perform app.notify_by_role(
    array['deputy_director','super_admin'],
    'فولدر النسافات الخارجة — المحطة التحويلية',
    format('وصل فولدر النسافات الخارجة لشهر %s (%s سجل) للاطلاع.', p_month, v_count),
    'info', '/deputy/station-folders');
  return v_count;
end;
$$;

-- ── صلاحيات دوال app ──
revoke all on function app.ts_saksat_send_folder(text) from public, anon, authenticated;
revoke all on function app.ts_trips_send_folder(text)  from public, anon, authenticated;
grant execute on function app.ts_saksat_send_folder(text) to authenticated;
grant execute on function app.ts_trips_send_folder(text)  to authenticated;

-- ── ⑦ أغلفة public (PostgREST) — درس 00042 ──
create or replace function public.ts_saksat_send_folder(p_month text)
returns integer
language sql
security invoker
set search_path = public, app
as $$ select app.ts_saksat_send_folder(p_month) $$;

create or replace function public.ts_trips_send_folder(p_month text)
returns integer
language sql
security invoker
set search_path = public, app
as $$ select app.ts_trips_send_folder(p_month) $$;

revoke all on function public.ts_saksat_send_folder(text) from public, anon;
revoke all on function public.ts_trips_send_folder(text)  from public, anon;
grant execute on function public.ts_saksat_send_folder(text) to authenticated;
grant execute on function public.ts_trips_send_folder(text)  to authenticated;