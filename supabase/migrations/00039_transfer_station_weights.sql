-- ═══════════════════════════════════════════════════════════════
-- 00039 · المحطة التحويلية — سجلات الأوزان (دفتر أوزان الشفتات)
--   · جدول ts_weight_records: ت · DB (رقم الآلية) · اسم السائق · صنف الآلية
--     · الوزن الكلي · الفارغ · الصافي (يُحسَب آلياً) · وقت الدخول · الشفت · التاريخ
--   · الحالة: draft → submitted_to_ops (أُرسل لغرفة العمليات للتدقيق)
--   · الأرشفة: حذف من المحطة = نقل لأرشيف IT (لا حذف فعلي) + تنبيه IT
--   · الاستعادة من IT تعيد السجل للمحطة
--   · RLS: المحطة تكتب/تقرأ نشيطها · IT تقرأ/تستعيد المؤرشف · غرفة العمليات تقرأ المُرسل
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.ts_weight_records (
  id            uuid primary key default gen_random_uuid(),

  -- ت (رقم التسلسل داخل الدفتر) — اختياري، يُحسب عند العرض إن خلا
  seq           integer,

  -- DB: رقم الآلية / اللوحة (كما في العمود الأزرق بالصورة)
  db_number     text not null,
  driver_name   text not null,
  vehicle_type  text,                          -- صنف الآلية

  gross_weight  numeric(10,2),                 -- الوزن الكلي (بالطن)
  tare_weight   numeric(10,2),                 -- الوزن الفارغ (بالطن)
  net_weight    numeric(10,2),                 -- الوزن الصافي = الكلي − الفارغ (يُحسَب آلياً)

  entry_time    time,                          -- وقت الدخول
  log_date      date not null default current_date,   -- تاريخ الدفتر
  shift         text not null default 'morning' check (shift in ('morning','evening')),

  status        text not null default 'draft'
                  check (status in ('draft','submitted_to_ops')),
  submitted_to_ops_at timestamptz,

  -- أرشفة (نقل لأرشيف IT) — نفس فلسفة 00029
  archived_at   timestamptz,
  archived_by   uuid references auth.users (id),
  archive_reason text,

  created_by    uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint ts_weights_net_chk check (
    gross_weight is null or tare_weight is null
    or net_weight is null or net_weight >= 0
  )
);

create index if not exists idx_ts_weights_date
  on public.ts_weight_records (log_date desc, shift);
create index if not exists idx_ts_weights_status
  on public.ts_weight_records (status) where status = 'submitted_to_ops';
create index if not exists idx_ts_weights_archived
  on public.ts_weight_records (archived_at) where archived_at is not null;
create index if not exists idx_ts_weights_active
  on public.ts_weight_records (created_at desc) where archived_at is null;

alter table public.ts_weight_records enable row level security;

-- قراءة السجلات النشطة: المحطة التحويلية + غرفة العمليات (للتدقيق) + المدير العام/المعاون
drop policy if exists "ts_weights: قراءة النشط" on public.ts_weight_records;
create policy "ts_weights: قراءة النشط" on public.ts_weight_records
  for select to authenticated
  using (
    archived_at is null
    and app.has_role(array['transfer_station','ops_room','super_admin',
                           'executive_director','deputy_director'])
  );

-- قراءة المؤرشف: IT والمدير المفوض حصراً (أرشيف مركزي)
drop policy if exists "ts_weights: قراءة المؤرشف" on public.ts_weight_records;
create policy "ts_weights: قراءة المؤرشف" on public.ts_weight_records
  for select to authenticated
  using (
    archived_at is not null
    and app.has_role(array['it_admin','super_admin'])
  );

-- إنشاء/تعديل النشط: المحطة التحويلية فقط
drop policy if exists "ts_weights: كتابة المحطة" on public.ts_weight_records;
create policy "ts_weights: كتابة المحطة" on public.ts_weight_records
  for insert to authenticated
  with check (
    app.has_role(array['transfer_station','super_admin'])
  );

drop policy if exists "ts_weights: تعديل المحطة" on public.ts_weight_records;
create policy "ts_weights: تعديل المحطة" on public.ts_weight_records
  for update to authenticated
  using      (app.has_role(array['transfer_station','super_admin']))
  with check (app.has_role(array['transfer_station','super_admin']));

-- لا حذف فعلي: الحذف محجوب بالكامل (الأرشفة عبر RPC)
drop policy if exists "ts_weights: منع الحذف" on public.ts_weight_records;
create policy "ts_weights: منع الحذف" on public.ts_weight_records
  for delete to authenticated
  using (false);

-- ── تحديث updated_at تلقائياً ──
create or replace function app.ts_weights_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists trg_ts_weights_touch on public.ts_weight_records;
create trigger trg_ts_weights_touch before update on public.ts_weight_records
  for each row execute function app.ts_weights_touch();

-- ═══ دالة مساعدة: تنبيه كل مستخدمي دور معيّن ═══
create or replace function app.notify_by_role(
  p_roles text[], p_title text, p_body text,
  p_type text default 'warning', p_link text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  for r in
    select distinct ur.user_id
    from public.user_roles ur
    where ur.role = any (p_roles)
  loop
    insert into public.notifications (user_id, title, body, type, link)
    values (r.user_id, p_title, p_body, p_type, p_link);
  end loop;
end;
$$;

-- ═══ ① أرشفة سجل وزن (حذف من المحطة → أرشيف IT) ═══
create or replace function app.ts_weight_archive(p_id text, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public, app
as $$
declare v_driver text; v_date date; v_db text;
begin
  if not app.has_role(array['transfer_station','super_admin']) then
    raise exception 'ARCHIVE_FORBIDDEN: الأرشفة من المحطة التحويلية حصراً';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'REASON_REQUIRED: سبب الأرشفة مطلوب';
  end if;

  select driver_name, log_date, db_number into v_driver, v_date, v_db
  from public.ts_weight_records
  where id = p_id::uuid and archived_at is null;

  if not found then
    raise exception 'RECORD_NOT_FOUND: السجل غير موجود أو مؤرشف مسبقاً';
  end if;

  update public.ts_weight_records
  set archived_at = now(), archived_by = auth.uid(), archive_reason = p_reason,
      status = 'draft', submitted_to_ops_at = null
  where id = p_id::uuid and archived_at is null;

  insert into public.audit_logs (table_name, record_id, operation, new_row, actor_id, actor_role)
  values ('ts_weight_records', p_id, 'ARCHIVE',
          jsonb_build_object('reason', p_reason, 'driver', v_driver, 'date', v_date, 'db', v_db),
          auth.uid(), app.current_role());

  -- تنبيه التطوير المركزية (IT)
  perform app.notify_by_role(
    array['it_admin','super_admin'],
    'أرشيف جديد من المحطة التحويلية',
    format('سجل وزن (%s | %s | %s) نُقل للأرشيف المركزي. السبب: %s',
           v_db, v_driver, v_date, p_reason),
    'warning',
    '/it/archive'
  );

  return true;
end;
$$;

-- ═══ ② استعادة سجل وزن من أرشيف IT → يعود للمحطة ═══
create or replace function app.ts_weight_restore(p_id text)
returns boolean
language plpgsql
security definer
set search_path = public, app
as $$
begin
  if not app.has_role(array['it_admin','super_admin']) then
    raise exception 'RESTORE_FORBIDDEN: الاستعادة من أرشيف IT حصراً';
  end if;

  update public.ts_weight_records
  set archived_at = null, archived_by = null, archive_reason = null
  where id = p_id::uuid and archived_at is not null;

  if not found then
    raise exception 'RECORD_NOT_FOUND: لا يوجد سجل مؤرشف بهذا المعرف';
  end if;

  insert into public.audit_logs (table_name, record_id, operation, actor_id, actor_role)
  values ('ts_weight_records', p_id, 'RESTORE', auth.uid(), app.current_role());

  -- تنبيه المحطة بالعودة
  perform app.notify_by_role(
    array['transfer_station','super_admin'],
    'تمت استعادة سجل وزن',
    format('أُعيد سجل الوزن %s من الأرشيف المركزي إلى المحطة التحويلية.', p_id),
    'success',
    '/transfer-station/archive'
  );

  return true;
end;
$$;

-- ═══ ③ إرسال دفتر أوزان إلى غرفة العمليات للتدقيق ═══
create or replace function app.ts_weight_send_to_ops(
  p_date date, p_shift text
)
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
  if p_shift not in ('morning','evening') then
    raise exception 'INVALID_SHIFT: الشفت غير صحيح';
  end if;

  update public.ts_weight_records
  set status = 'submitted_to_ops', submitted_to_ops_at = now()
  where log_date = p_date and shift = p_shift
    and archived_at is null and status = 'draft';

  get diagnostics v_count = row_count;

  insert into public.audit_logs (table_name, record_id, operation, new_row, actor_id, actor_role)
  values ('ts_weight_records', p_date::text || ':' || p_shift, 'SEND_TO_OPS',
          jsonb_build_object('date', p_date, 'shift', p_shift, 'count', v_count),
          auth.uid(), app.current_role());

  perform app.notify_by_role(
    array['ops_room','super_admin'],
    'دفتر أوزان للتدقيق — المحطة التحويلية',
    format('وصل دفتر أوزان %s بتاريخ %s (%s سجل) للتدقيق.',
           case when p_shift = 'morning' then 'الصباحي' else 'المسائي' end,
           p_date, v_count),
    'info',
    '/ops-room'
  );

  return v_count;
end;
$$;

-- ═══ ④ ملخص إحصائي للوحة الرئيسية ═══
create or replace function app.ts_weight_summary(p_days integer default 7)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not app.has_role(array['transfer_station','ops_room','super_admin',
                                'executive_director','deputy_director']) then '{}'::jsonb
    else (
      select jsonb_build_object(
        'total_records',  count(*) filter (where archived_at is null),
        'today_records',  count(*) filter (where log_date = current_date and archived_at is null),
        'pending_ops',    count(*) filter (where status = 'draft' and archived_at is null),
        'submitted_ops',  count(*) filter (where status = 'submitted_to_ops' and archived_at is null),
        'archived',       count(*) filter (where archived_at is not null),
        'total_net_tons', coalesce(sum(net_weight) filter (where archived_at is null),0),
        'today_net_tons', coalesce(sum(net_weight) filter (where log_date = current_date and archived_at is null),0)
      )
      from public.ts_weight_records
      where log_date >= current_date - (p_days * interval '1 day') or archived_at is not null
    )
  end;
$$;

-- ═══ صلاحيات التنفيذ ═══
revoke all on function app.ts_weight_archive(text,text)  from public, anon, authenticated;
revoke all on function app.ts_weight_restore(text)       from public, anon, authenticated;
revoke all on function app.ts_weight_send_to_ops(date,text) from public, anon, authenticated;
revoke all on function app.ts_weight_summary(integer)    from public, anon, authenticated;
grant execute on function app.ts_weight_archive(text,text)  to authenticated;
grant execute on function app.ts_weight_restore(text)       to authenticated;
grant execute on function app.ts_weight_send_to_ops(date,text) to authenticated;
grant execute on function app.ts_weight_summary(integer)    to authenticated;
