-- 00284 — الاحتفاظ بالبيانات النصية (٦ · 00341): الحذف التلقائي مع مهلة أمان + «يحتاج تأكيد IT أم لا» لكل نوع
-- لكل سياسة: requires_confirm (افتراضي نعم = كما كان: لا حذف إلا بتأكيد IT) و grace_days (مهلة أمان 0..90 يوماً، افتراضي 7).
-- عندما لا يُطلب التأكيد: الفحص اليومي ينشئ الطلب ويبلّغ IT بموعد الحذف التلقائي؛ خلال المهلة يمكن الإلغاء أو التأجيل أو التأكيد فوراً.
-- عند انقضاء المهلة: إن كان النوع يتطلب تصديراً ولم يُسجَّل تصدير ⇒ لا حذف، يُعاد التنبيه كل يوم. وإلا يُؤكَّد الطلب باسم «النظام» ويُحذف بدفعات
-- (حدّ يومي 20 دفعة × 5000 صف؛ الباقي يُكمل في اليوم التالي). أقفال السلامة وفحص «التصدير ما زال مطابقاً» تسري كما في التأكيد اليدوي.

alter table public.data_retention_policies add column if not exists requires_confirm boolean not null default true;
alter table public.data_retention_policies add column if not exists grace_days int not null default 7;
alter table public.data_retention_policies drop constraint if exists data_retention_policies_grace_days_check;
alter table public.data_retention_policies add constraint data_retention_policies_grace_days_check check (grace_days between 0 and 90);
alter table public.data_retention_requests add column if not exists auto_delete_at timestamptz;   -- null = يحتاج تأكيداً يدوياً
alter table public.data_retention_requests add column if not exists postponed_count int not null default 0;
alter table public.data_retention_requests add column if not exists blocked_notified_on date;      -- آخر يوم أُبلغ فيه IT بأن الحذف التلقائي محجوز بانتظار التصدير

-- ─────────────── ① JSON الطلب ───────────────
create or replace function app.data_retention_request_json(r public.data_retention_requests) returns jsonb
language sql stable security definer set search_path = public, app as $$
  select jsonb_build_object(
    'id', r.id, 'data_key', r.data_key, 'label', (select c.label from app.data_retention_catalog() c where c.data_key = r.data_key),
    'cutoff', r.cutoff, 'status', r.status,
    'rows_total', r.rows_total, 'rows_locked', r.rows_locked, 'rows_deletable', r.rows_total - r.rows_locked,
    'export_required', coalesce((select p.export_required from public.data_retention_policies p where p.data_key = r.data_key), false),
    'rows_exported', r.rows_exported, 'export_sha256', r.export_sha256, 'export_label', r.export_label,
    'exported_by_name', app.user_display_name(r.exported_by), 'exported_at', r.exported_at,
    'confirmed_by_name', case when r.confirmed_at is not null and r.confirmed_by is null then 'النظام (تلقائي)' else app.user_display_name(r.confirmed_by) end, 'confirmed_at', r.confirmed_at,
    'rows_deleted', r.rows_deleted, 'finished_at', r.finished_at, 'created_at', r.created_at, 'updated_at', r.updated_at,
    'auto_delete_at', r.auto_delete_at, 'postponed_count', r.postponed_count,
    'auto_blocked_export', r.auto_delete_at is not null and r.status = 'pending' and r.auto_delete_at <= now()
                           and coalesce((select p.export_required from public.data_retention_policies p where p.data_key = r.data_key), false),
    'can_export', r.status = 'pending',
    'can_confirm', (r.status = 'exported') or (r.status = 'pending' and not coalesce((select p.export_required from public.data_retention_policies p where p.data_key = r.data_key), false)),
    'can_postpone', r.auto_delete_at is not null and r.status in ('pending','exported'),
    'events', coalesce((select jsonb_agg(jsonb_build_object('action', e.action, 'details', e.details, 'actor_name', e.actor_name, 'at', e.created_at) order by e.id)
                        from public.data_retention_events e where e.request_id = r.id), '[]'::jsonb))
$$;

-- ─────────────── ② الإعدادات ───────────────
create or replace function public.data_retention_settings_get() returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
begin
  perform app.require_it();
  return coalesce((select jsonb_agg(jsonb_build_object(
      'data_key', c.data_key, 'portal_key', c.portal_key, 'portal_label', pt.label,
      'label', c.label, 'description', c.description, 'safety_lock', c.safety_lock,
      'table_name', c.table_name, 'time_column', c.time_column, 'deletable', c.deletable,
      'enabled', coalesce(p.enabled, false) and c.deletable,
      'retention_months', coalesce(p.retention_months, nullif(c.default_months, 0), 12),
      'export_required', coalesce(p.export_required, c.default_export_required),
      'requires_confirm', coalesce(p.requires_confirm, true),
      'grace_days', coalesce(p.grace_days, 7),
      'updated_at', p.updated_at, 'updated_by_name', app.user_display_name(p.updated_by),
      'open_request', (select app.data_retention_request_json(r) from public.data_retention_requests r
                        where r.data_key = c.data_key and r.status in ('pending','exported','confirmed','deleting') limit 1)
    ) order by pt.sort, c.deletable desc, c.label)
    from app.data_retention_catalog() c
    join app.data_retention_portals() pt on pt.portal_key = c.portal_key
    left join public.data_retention_policies p on p.data_key = c.data_key), '[]'::jsonb);
end$$;

drop function if exists public.data_retention_policy_set(text, boolean, int, boolean);
create or replace function public.data_retention_policy_set(p_key text, p_enabled boolean, p_months int, p_export_required boolean,
                                                            p_requires_confirm boolean default true, p_grace_days int default 7) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare c record; rc boolean := coalesce(p_requires_confirm, true); gd int := coalesce(p_grace_days, 7);
begin
  perform app.require_it();
  select * into c from app.data_retention_catalog() k where k.data_key = p_key;
  if c.data_key is null then raise exception 'RETENTION_UNKNOWN_KEY: %', p_key; end if;
  if not c.deletable then raise exception 'RETENTION_LOCKED: %', p_key; end if;
  if p_months is null or p_months < 1 or p_months > 120 then raise exception 'RETENTION_INPUT_INVALID: months'; end if;
  if gd < 0 or gd > 90 then raise exception 'RETENTION_INPUT_INVALID: grace_days'; end if;
  insert into public.data_retention_policies (data_key, enabled, retention_months, export_required, requires_confirm, grace_days, updated_by, updated_at)
  values (p_key, coalesce(p_enabled, false), p_months, coalesce(p_export_required, false), rc, gd, auth.uid(), now())
  on conflict (data_key) do update set enabled = excluded.enabled, retention_months = excluded.retention_months,
    export_required = excluded.export_required, requires_confirm = excluded.requires_confirm, grace_days = excluded.grace_days,
    updated_by = excluded.updated_by, updated_at = now();
  perform app.data_retention_log(null, p_key, 'policy_set', jsonb_build_object('enabled', p_enabled, 'months', p_months, 'export_required', p_export_required, 'requires_confirm', rc, 'grace_days', gd));
  if not coalesce(p_enabled, false) then
    update public.data_retention_requests set status = 'cancelled', updated_at = now(), finished_at = now()
    where data_key = p_key and status in ('pending','exported');
  else
    -- تغيير نمط التأكيد ينعكس على الطلب المفتوح غير المؤكَّد: يدوي ⇒ لا موعد تلقائي؛ تلقائي ⇒ موعد جديد من الآن + المهلة
    update public.data_retention_requests
      set auto_delete_at = case when rc then null else now() + make_interval(days => gd) end, updated_at = now()
      where data_key = p_key and status in ('pending','exported')
        and (rc and auto_delete_at is not null or not rc and auto_delete_at is null);
  end if;
  return public.data_retention_settings_get();
end$$;
revoke all on function public.data_retention_policy_set(text, boolean, int, boolean, boolean, int) from public;
grant execute on function public.data_retention_policy_set(text, boolean, int, boolean, boolean, int) to authenticated;

-- ─────────────── ③ التأجيل (IT) ───────────────
create or replace function public.data_retention_postpone(p_request uuid, p_days int default 7) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare r public.data_retention_requests; d int := coalesce(p_days, 7);
begin
  perform app.require_it();
  if d < 1 or d > 90 then raise exception 'RETENTION_INPUT_INVALID: days'; end if;
  select * into r from public.data_retention_requests where id = p_request for update;
  if r.id is null then raise exception 'RETENTION_NOT_FOUND'; end if;
  if r.status not in ('pending','exported') then raise exception 'RETENTION_BAD_STATE: %', r.status; end if;
  if r.auto_delete_at is null then raise exception 'RETENTION_NOT_AUTO'; end if;
  update public.data_retention_requests
    set auto_delete_at = greatest(auto_delete_at, now()) + make_interval(days => d), postponed_count = postponed_count + 1, blocked_notified_on = null, updated_at = now()
    where id = r.id returning * into r;
  perform app.data_retention_log(r.id, r.data_key, 'postponed', jsonb_build_object('days', d, 'auto_delete_at', r.auto_delete_at));
  return app.data_retention_request_json(r);
end$$;
revoke all on function public.data_retention_postpone(uuid, int) from public;
grant execute on function public.data_retention_postpone(uuid, int) to authenticated;

-- ─────────────── ④ الفحص اليومي: إنشاء الطلبات + تنفيذ ما انقضت مهلته ───────────────
create or replace function app.data_retention_scan() returns int
language plpgsql security definer set search_path = public, app as $$
declare p record; c record; cut timestamptz; r public.data_retention_requests; created int := 0; lbl text; n bigint; batches int; done_now boolean;
begin
  -- (أ) إنشاء/تحديث الطلبات
  for p in select pol.* from public.data_retention_policies pol join app.data_retention_catalog() k on k.data_key = pol.data_key where pol.enabled and k.deletable loop
    cut := date_trunc('day', now() - make_interval(months => p.retention_months));
    lbl := (select cc.label from app.data_retention_catalog() cc where cc.data_key = p.data_key);
    select * into r from public.data_retention_requests where data_key = p.data_key and status in ('pending','exported','confirmed','deleting') limit 1;
    if r.id is null then
      select * into c from app.data_retention_count(p.data_key, cut);
      if c.total - c.locked > 0 then
        insert into public.data_retention_requests (data_key, cutoff, rows_total, rows_locked, auto_delete_at)
          values (p.data_key, cut, c.total, c.locked, case when p.requires_confirm then null else now() + make_interval(days => p.grace_days) end) returning * into r;
        perform app.data_retention_log(r.id, p.data_key, 'request_created', jsonb_build_object('cutoff', cut, 'rows_total', c.total, 'rows_locked', c.locked, 'months', p.retention_months, 'auto_delete_at', r.auto_delete_at));
        if p.requires_confirm then
          perform app.notify_by_role(array['it_admin','super_admin'], 'طلب حذف بيانات بانتظار قراركم: ' || lbl,
            format('انقضت مدة الاحتفاظ (%s أشهر). %s صفاً أقدم من %s قابلة للحذف%s. لن يُحذف شيء قبل %sالتأكيد من التطوير المركزية.',
                   p.retention_months, c.total - c.locked, to_char(cut at time zone 'Asia/Baghdad', 'YYYY-MM-DD'),
                   case when c.locked > 0 then format(' (و%s محمية بقفل السلامة)', c.locked) else '' end,
                   case when p.export_required then 'التصدير و' else '' end),
            'warning', '/it/data-retention');
        else
          perform app.notify_by_role(array['it_admin','super_admin'], 'حذف تلقائي مجدول: ' || lbl,
            format('انقضت مدة الاحتفاظ (%s أشهر). %s صفاً أقدم من %s ستُحذف تلقائياً في %s%s ما لم تلغوا الطلب أو تؤجلوه من صفحة الاحتفاظ.%s',
                   p.retention_months, c.total - c.locked, to_char(cut at time zone 'Asia/Baghdad', 'YYYY-MM-DD'),
                   to_char(r.auto_delete_at at time zone 'Asia/Baghdad', 'YYYY-MM-DD HH24:MI'),
                   case when c.locked > 0 then format(' (و%s محمية بقفل السلامة لن تُمسّ)', c.locked) else '' end,
                   case when p.export_required then ' هذا النوع يتطلب تصديراً مُثبَتاً — بلا تصدير لن يُحذف شيء.' else '' end),
            'warning', '/it/data-retention');
        end if;
        created := created + 1;
      end if;
    elsif r.status = 'pending' then
      select * into c from app.data_retention_count(p.data_key, cut);
      update public.data_retention_requests set cutoff = cut, rows_total = c.total, rows_locked = c.locked, updated_at = now() where id = r.id;
    end if;
  end loop;

  -- (ب) تنفيذ الطلبات التلقائية التي انقضت مهلتها
  for r in select q.* from public.data_retention_requests q
           join public.data_retention_policies pol on pol.data_key = q.data_key and pol.enabled and not pol.requires_confirm
           where q.auto_delete_at is not null and q.auto_delete_at <= now() and q.status in ('pending','exported','confirmed','deleting')
           order by q.auto_delete_at loop
    lbl := (select cc.label from app.data_retention_catalog() cc where cc.data_key = r.data_key);
    select * into p from public.data_retention_policies where data_key = r.data_key;
    if r.status = 'pending' and p.export_required then
      -- محجوز: لا حذف بلا تصدير مُثبَت؛ تنبيه مرة يومياً
      if r.blocked_notified_on is distinct from (now() at time zone 'Asia/Baghdad')::date then
        update public.data_retention_requests set blocked_notified_on = (now() at time zone 'Asia/Baghdad')::date, updated_at = now() where id = r.id;
        perform app.data_retention_log(r.id, r.data_key, 'auto_blocked_export', jsonb_build_object('rows_deletable', r.rows_total - r.rows_locked));
        perform app.notify_by_role(array['it_admin','super_admin'], 'حذف تلقائي محجوز بانتظار التصدير: ' || lbl,
          format('انقضت مهلة الأمان لكن هذا النوع يتطلب تصديراً مُثبَتاً ولم يُسجَّل تصدير. لن يُحذف شيء حتى تصدّروا (%s صفاً) أو تلغوا الطلب.', r.rows_total - r.rows_locked),
          'warning', '/it/data-retention');
      end if;
      continue;
    end if;
    if r.status in ('pending','exported') then
      if r.status = 'exported' then
        select * into c from app.data_retention_count(r.data_key, r.cutoff);
        if r.rows_exported is distinct from (c.total - c.locked) then
          -- التصدير لم يعد مطابقاً: يعود الطلب إلى «بانتظار التصدير» ويُبلَّغ IT، بلا حذف
          update public.data_retention_requests set status = 'pending', rows_exported = null, export_sha256 = null, export_label = null, exported_by = null, exported_at = null,
            rows_total = c.total, rows_locked = c.locked, blocked_notified_on = null, updated_at = now() where id = r.id;
          perform app.data_retention_log(r.id, r.data_key, 'auto_export_stale', jsonb_build_object('exported', r.rows_exported, 'now', c.total - c.locked));
          perform app.notify_by_role(array['it_admin','super_admin'], 'تعذّر الحذف التلقائي — التصدير لم يعد مطابقاً: ' || lbl,
            'تغيّرت البيانات بعد التصدير. أعيدوا التصدير ليتم الحذف في الفحص التالي، أو ألغوا الطلب.', 'warning', '/it/data-retention');
          continue;
        end if;
      end if;
      update public.data_retention_requests set status = 'confirmed', confirmed_by = null, confirmed_at = now(), updated_at = now() where id = r.id returning * into r;
      perform app.data_retention_log(r.id, r.data_key, 'auto_confirmed', jsonb_build_object('rows_deletable', r.rows_total - r.rows_locked, 'auto_delete_at', r.auto_delete_at));
    end if;
    -- حذف بدفعات (حدّ يومي)
    batches := 0; done_now := false;
    loop
      n := app.data_retention_delete_some(r.data_key, r.cutoff, 5000);
      select * into c from app.data_retention_count(r.data_key, r.cutoff);
      batches := batches + 1;
      update public.data_retention_requests set rows_deleted = rows_deleted + n, status = case when c.total - c.locked = 0 then 'done' else 'deleting' end,
        finished_at = case when c.total - c.locked = 0 then now() else null end, updated_at = now() where id = r.id returning * into r;
      if r.status = 'done' then done_now := true; exit; end if;
      if n > 0 then perform app.data_retention_log(r.id, r.data_key, 'batch', jsonb_build_object('rows', n, 'auto', true)); end if;
      exit when batches >= 20 or n = 0;
    end loop;
    if done_now then
      perform app.data_retention_log(r.id, r.data_key, 'done', jsonb_build_object('rows_deleted', r.rows_deleted, 'rows_locked_kept', c.locked, 'auto', true));
      perform app.notify_by_role(array['it_admin','super_admin'], 'اكتمل الحذف التلقائي: ' || lbl,
        format('حُذف %s صفاً أقدم من %s تلقائياً بعد انقضاء مهلة الأمان%s.', r.rows_deleted, to_char(r.cutoff at time zone 'Asia/Baghdad', 'YYYY-MM-DD'),
               case when c.locked > 0 then format('، وبقيت %s محمية بقفل السلامة', c.locked) else '' end),
        'info', '/it/data-retention');
    else
      perform app.notify_by_role(array['it_admin','super_admin'], 'الحذف التلقائي مستمر: ' || lbl,
        format('حُذف حتى الآن %s صفاً؛ بقي %s. يُستكمل في الفحص التالي أو يمكنكم استئنافه يدوياً.', r.rows_deleted, c.total - c.locked), 'info', '/it/data-retention');
    end if;
  end loop;
  return created;
end$$;
