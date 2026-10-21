-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 00269 · الأرشيف البارد (١/٤) — الأساس في قاعدة البيانات
--   الفكرة: البيانات النصية تبقى في المنصة إلى الأبد؛ الملفات (الصور/المرفقات) القديمة تُسحب
--   إلى قرص خارجي، تُتحقَّق بالبصمات (SHA-256)، وبعد مهلة أمان تُحذف من التخزين السحابي فقط.
--   هذا الترحيل: الإعدادات (قابلة للضبط بالكامل) · المعاينة · إنشاء الحزمة (تثبيت قائمة الملفات)
--   · تسجيل التنزيل والبصمات · التحقق من نسخة قرص · بدء الحذف وتأكيده · سجل الأحداث.
--   الحذف الفعلي من التخزين يتم من العميل (storage.remove) لأن حذف صفوف storage.objects لا يحذف
--   الملف الفعلي؛ لذلك: purge_begin (يقفل ويعيد القائمة) ⇒ العميل يحذف ⇒ purge_confirm (يوثّق).
--   كل الدوال لبوابة التطوير المركزية فقط (app.require_it).
-- ═══════════════════════════════════════════════════════════════════════════════════════

-- ─────────────── ① الإعدادات ───────────────
create table if not exists public.cold_archive_settings (
  id               smallint primary key default 1 check (id = 1),
  required_copies  int  not null default 1 check (required_copies between 1 and 5),   -- نسخ متحقَّق منها قبل فتح الحذف
  grace_days       int  not null default 7 check (grace_days between 0 and 365),        -- مهلة أمان بعد التحقق
  sources          jsonb not null default '{}'::jsonb,       -- {source_key: {enabled: bool}} — يُدمج فوق الافتراضي
  protections      jsonb not null default '{}'::jsonb,       -- {protection_key: bool} — يُدمج فوق الافتراضي
  updated_by       uuid references auth.users(id),
  updated_at       timestamptz not null default now()
);
insert into public.cold_archive_settings (id) values (1) on conflict (id) do nothing;
alter table public.cold_archive_settings enable row level security;
drop policy if exists "cold_archive_settings: it read" on public.cold_archive_settings;
create policy "cold_archive_settings: it read" on public.cold_archive_settings for select to authenticated using (app.has_role(array['it_admin','super_admin']));
grant select on public.cold_archive_settings to authenticated;

-- كتالوج المصادر: ما الذي يأخذ مساحة، وأين، وهل يدخل الحزم افتراضياً
create or replace function app.cold_archive_source_catalog()
returns table (source_key text, label text, bucket text, default_enabled boolean, sensitive boolean, description text)
language sql immutable as $$
  values
    ('media_submission_photos',      'صور الإعلام (تذاكر المسؤولين والمتعهدين)', 'media-photos',            true,  false, 'أكبر مستهلك للمساحة — صور الأعمال اليومية'),
    ('contractor_checkins',          'صور المتعهدين (سيلفي + صورة العمل)',       'contractor-photos',       true,  false, 'إثبات التواجد اليومي'),
    ('complaint_media',              'صور ومرفقات الشكاوى الرسمية',               'complaint-media',         true,  false, 'صور قبل/بعد ومرفقات كتب لجنة الإشراف'),
    ('citizen_complaint_photos',     'صور شكاوى المواطنين',                       'citizen-complaints',      true,  false, 'ما يرفعه المواطن مع شكواه'),
    ('citizen_chat_attachments',     'مرفقات محادثات المواطنين',                  'citizen-complaints',      true,  false, 'صور المحادثة المباشرة'),
    ('sector_photos',                'صور القواطع (الإشراف)',                     'sector-photos',           true,  false, 'صور المسؤولين الميدانية القديمة'),
    ('gbs_container_updates',        'صور تحديثات حاويات GBS',                    'gbs-containers',          true,  false, 'صور طلبات تغيير حالة الحاوية'),
    ('vehicle_maintenance_attachments','مرفقات الصيانة',                           'maintenance-attachments', false, true,  'مرفقات طلبات الصيانة — افتراضياً تبقى'),
    ('garage_vehicles',              'صور الآليات',                               'garage-vehicles',         false, true,  'صورة تعريفية لكل آلية — تبقى'),
    ('employee_documents',           'مستندات الموظفين',                          'employee-documents',      false, true,  'هويات وعقود — لا تُحذف افتراضياً'),
    ('media_covers',                 'مكتبة أغلفة الإعلام',                        'media-photos',            false, true,  'قوالب الأغلفة — تبقى')
$$;

-- الحمايات: سجلات لا تُحذف ملفاتها حتى لو كانت ضمن الفترة (كلها قابلة للإيقاف من الإعدادات)
create or replace function app.cold_archive_protection_catalog()
returns table (protection_key text, label text, default_on boolean)
language sql immutable as $$
  values
    ('protect_design_photos',          'صور مستخدمة في تصميم إعلامي (مسودة أو مكتمل) تبقى',          true),
    ('protect_unlocked_contractor_months','صور المتعهدين لشهر لم تعتمده المالية بعد تبقى',           true),
    ('protect_open_complaints',        'مرفقات شكوى رسمية لم تُعتمد/تُؤرشف بعد تبقى',                 true),
    ('protect_open_citizen_complaints','صور شكوى مواطن غير محلولة تبقى',                              true),
    ('protect_pending_gbs',            'صور طلب حاوية ما زال بانتظار المراجعة تبقى',                   true)
$$;

create or replace function app.cold_archive_effective_settings() returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare s public.cold_archive_settings; src jsonb := '{}'::jsonb; prot jsonb := '{}'::jsonb; r record;
begin
  select * into s from public.cold_archive_settings where id = 1;
  for r in select * from app.cold_archive_source_catalog() loop
    src := src || jsonb_build_object(r.source_key, jsonb_build_object(
      'label', r.label, 'bucket', r.bucket, 'sensitive', r.sensitive, 'description', r.description,
      'enabled', coalesce((s.sources -> r.source_key ->> 'enabled')::boolean, r.default_enabled)));
  end loop;
  for r in select * from app.cold_archive_protection_catalog() loop
    prot := prot || jsonb_build_object(r.protection_key, jsonb_build_object('label', r.label,
      'on', coalesce((s.protections ->> r.protection_key)::boolean, r.default_on)));
  end loop;
  return jsonb_build_object('required_copies', s.required_copies, 'grace_days', s.grace_days,
                            'sources', src, 'protections', prot, 'updated_at', s.updated_at);
end$$;

create or replace function public.cold_archive_settings_get() returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
begin perform app.require_it(); return app.cold_archive_effective_settings(); end$$;

create or replace function public.cold_archive_settings_set(p_required_copies int, p_grace_days int, p_sources jsonb, p_protections jsonb)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare k text; v jsonb; clean_src jsonb := '{}'::jsonb; clean_prot jsonb := '{}'::jsonb;
begin
  perform app.require_it();
  if p_required_copies is null or p_required_copies not between 1 and 5 then raise exception 'COLD_ARCHIVE_INPUT_INVALID: required_copies'; end if;
  if p_grace_days is null or p_grace_days not between 0 and 365 then raise exception 'COLD_ARCHIVE_INPUT_INVALID: grace_days'; end if;
  for k, v in select * from jsonb_each(coalesce(p_sources, '{}'::jsonb)) loop
    if not exists (select 1 from app.cold_archive_source_catalog() c where c.source_key = k) then raise exception 'COLD_ARCHIVE_INPUT_INVALID: source %', k; end if;
    clean_src := clean_src || jsonb_build_object(k, jsonb_build_object('enabled', coalesce((v ->> 'enabled')::boolean, (v #>> '{}')::boolean)));
  end loop;
  for k, v in select * from jsonb_each(coalesce(p_protections, '{}'::jsonb)) loop
    if not exists (select 1 from app.cold_archive_protection_catalog() c where c.protection_key = k) then raise exception 'COLD_ARCHIVE_INPUT_INVALID: protection %', k; end if;
    clean_prot := clean_prot || jsonb_build_object(k, (v #>> '{}')::boolean);
  end loop;
  update public.cold_archive_settings set required_copies = p_required_copies, grace_days = p_grace_days,
         sources = clean_src, protections = clean_prot, updated_by = auth.uid(), updated_at = now() where id = 1;
  perform app.cold_archive_log(null, 'settings_updated', jsonb_build_object('required_copies', p_required_copies, 'grace_days', p_grace_days, 'sources', clean_src, 'protections', clean_prot));
  return app.cold_archive_effective_settings();
end$$;

-- ─────────────── ② الحزم والعناصر والنسخ والسجل ───────────────
create sequence if not exists public.cold_archive_pkg_seq;
create table if not exists public.cold_archive_packages (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique,
  period_from        date not null,
  period_to          date not null check (period_to >= period_from),
  status             text not null default 'ready' check (status in ('ready','verified','purging','purged','cancelled')),
  note               text,
  file_count         int    not null default 0,
  total_bytes        bigint not null default 0,
  downloaded_count   int    not null default 0,
  verified_copies    int    not null default 0,
  required_copies    int    not null,          -- لقطة من الإعدادات وقت الإنشاء
  grace_days         int    not null,
  purge_available_at timestamptz,
  purged_count       int    not null default 0,
  created_by         uuid references auth.users(id),
  created_at         timestamptz not null default now(),
  verified_at        timestamptz,
  purge_started_by   uuid references auth.users(id),
  purge_started_at   timestamptz,
  purged_at          timestamptz,
  cancelled_at       timestamptz
);
create table if not exists public.cold_archive_items (
  id            bigint generated by default as identity primary key,
  package_id    uuid not null references public.cold_archive_packages(id) on delete cascade,
  source_key    text not null,
  record_id     text not null,
  record_date   date not null,
  bucket        text not null,
  storage_path  text not null,
  size_bytes    bigint,
  sha256        text,                                  -- تُسجَّل من الأداة بعد التنزيل
  status        text not null default 'listed' check (status in ('listed','downloaded','purged','missing')),
  downloaded_at timestamptz,
  purged_at     timestamptz,
  unique (package_id, bucket, storage_path)
);
create index if not exists cold_archive_items_path_idx on public.cold_archive_items (bucket, storage_path);
create index if not exists cold_archive_items_pkg_status_idx on public.cold_archive_items (package_id, status);
create table if not exists public.cold_archive_copies (
  id           bigint generated by default as identity primary key,
  package_id   uuid not null references public.cold_archive_packages(id) on delete cascade,
  disk_label   text not null check (length(trim(disk_label)) between 1 and 80),
  ok_count     int  not null,
  verified_by  uuid references auth.users(id),
  verified_at  timestamptz not null default now(),
  unique (package_id, disk_label)
);
create table if not exists public.cold_archive_events (
  id          bigint generated by default as identity primary key,
  package_id  uuid references public.cold_archive_packages(id) on delete cascade,
  action      text not null,
  details     jsonb,
  actor_id    uuid,
  actor_name  text,
  created_at  timestamptz not null default now()
);
alter table public.cold_archive_packages enable row level security;
alter table public.cold_archive_items    enable row level security;
alter table public.cold_archive_copies   enable row level security;
alter table public.cold_archive_events   enable row level security;
drop policy if exists "cold_archive_packages: it read" on public.cold_archive_packages;
create policy "cold_archive_packages: it read" on public.cold_archive_packages for select to authenticated using (app.has_role(array['it_admin','super_admin']));
drop policy if exists "cold_archive_items: it read" on public.cold_archive_items;
create policy "cold_archive_items: it read" on public.cold_archive_items for select to authenticated using (app.has_role(array['it_admin','super_admin']));
drop policy if exists "cold_archive_copies: it read" on public.cold_archive_copies;
create policy "cold_archive_copies: it read" on public.cold_archive_copies for select to authenticated using (app.has_role(array['it_admin','super_admin']));
drop policy if exists "cold_archive_events: it read" on public.cold_archive_events;
create policy "cold_archive_events: it read" on public.cold_archive_events for select to authenticated using (app.has_role(array['it_admin','super_admin']));
grant select on public.cold_archive_packages, public.cold_archive_items, public.cold_archive_copies, public.cold_archive_events to authenticated;

create or replace function app.cold_archive_log(p_pkg uuid, p_action text, p_details jsonb) returns void
language plpgsql security definer set search_path = public, app as $$
begin
  insert into public.cold_archive_events (package_id, action, details, actor_id, actor_name)
  values (p_pkg, p_action, p_details, auth.uid(), app.user_display_name(auth.uid()));
end$$;

-- ─────────────── ③ جمع الملفات المرشحة لفترة (مع سبب الاستثناء) ───────────────
create or replace function app.cold_archive_collect(p_from date, p_to date)
returns table (source_key text, record_id text, record_date date, bucket text, storage_path text, excluded_reason text)
language plpgsql stable security definer set search_path = public, app as $$
declare eff jsonb := app.cold_archive_effective_settings();
  en_media boolean := (eff #>> '{sources,media_submission_photos,enabled}')::boolean;
  en_contr boolean := (eff #>> '{sources,contractor_checkins,enabled}')::boolean;
  en_cmed  boolean := (eff #>> '{sources,complaint_media,enabled}')::boolean;
  en_cit   boolean := (eff #>> '{sources,citizen_complaint_photos,enabled}')::boolean;
  en_chat  boolean := (eff #>> '{sources,citizen_chat_attachments,enabled}')::boolean;
  en_sect  boolean := (eff #>> '{sources,sector_photos,enabled}')::boolean;
  en_gbs   boolean := (eff #>> '{sources,gbs_container_updates,enabled}')::boolean;
  en_maint boolean := (eff #>> '{sources,vehicle_maintenance_attachments,enabled}')::boolean;
  en_veh   boolean := (eff #>> '{sources,garage_vehicles,enabled}')::boolean;
  en_emp   boolean := (eff #>> '{sources,employee_documents,enabled}')::boolean;
  en_cov   boolean := (eff #>> '{sources,media_covers,enabled}')::boolean;
  pr_design boolean := (eff #>> '{protections,protect_design_photos,on}')::boolean;
  pr_month  boolean := (eff #>> '{protections,protect_unlocked_contractor_months,on}')::boolean;
  pr_compl  boolean := (eff #>> '{protections,protect_open_complaints,on}')::boolean;
  pr_cit    boolean := (eff #>> '{protections,protect_open_citizen_complaints,on}')::boolean;
  pr_gbs    boolean := (eff #>> '{protections,protect_pending_gbs,on}')::boolean;
begin
  return query
  -- صور الإعلام
  select 'media_submission_photos', p.id::text, coalesce(s.event_date, s.created_at::date), 'media-photos', p.storage_path,
         case when pr_design and exists (select 1 from public.media_design_photos d where d.source_photo_id = p.id) then 'مستخدمة في تصميم إعلامي' end
  from public.media_submission_photos p join public.media_submissions s on s.id = p.submission_id
  where en_media and coalesce(s.event_date, s.created_at::date) between p_from and p_to
  union all
  -- صور المتعهدين (ملفّان لكل تسجيل)
  select 'contractor_checkins', c.id::text, c.log_date, 'contractor-photos', x.path,
         case when pr_month and not exists (select 1 from public.contractor_month_approvals a where a.month = date_trunc('month', c.log_date)::date and a.is_locked) then 'شهر لم تعتمده المالية بعد' end
  from public.contractor_checkins c cross join lateral (values (c.selfie_path), (c.team_photo_path)) x(path)
  where en_contr and c.log_date between p_from and p_to and x.path is not null
  union all
  -- مرفقات الشكاوى الرسمية
  select 'complaint_media', m.id::text, m.created_at::date, 'complaint-media', m.storage_path,
         case when pr_compl and not (
                (m.item_id is not null and exists (select 1 from public.complaint_items i where i.id = m.item_id and i.status = 'approved'))
             or (m.item_id is null and exists (select 1 from public.complaint_inbox_messages im where im.id = m.inbox_message_id and im.archived_at is not null))
           ) then 'شكوى لم تُعتمد/تُؤرشف بعد' end
  from public.complaint_media m
  where en_cmed and m.created_at::date between p_from and p_to
  union all
  -- صور شكاوى المواطنين
  select 'citizen_complaint_photos', cp.id::text, cp.created_at::date, 'citizen-complaints', cp.path,
         case when pr_cit and exists (select 1 from public.citizen_complaints cc where cc.id = cp.complaint_id and cc.status <> 'resolved') then 'شكوى مواطن غير محلولة' end
  from public.citizen_complaint_photos cp
  where en_cit and cp.created_at::date between p_from and p_to
  union all
  -- مرفقات محادثات المواطنين
  select 'citizen_chat_attachments', cm.id::text, cm.created_at::date, 'citizen-complaints', cm.attachment_path, null::text
  from public.citizen_chat_messages cm
  where en_chat and cm.attachment_path is not null and cm.created_at::date between p_from and p_to
  union all
  -- صور القواطع
  select 'sector_photos', sp.id::text, sp.created_at::date, 'sector-photos', sp.storage_path, null::text
  from public.sector_photos sp
  where en_sect and sp.created_at::date between p_from and p_to
  union all
  -- صور تحديثات GBS
  select 'gbs_container_updates', g.id::text, g.created_at::date, 'gbs-containers', g.photo_path,
         case when pr_gbs and g.state = 'pending' then 'طلب حاوية بانتظار المراجعة' end
  from public.gbs_container_updates g
  where en_gbs and g.photo_path is not null and g.created_at::date between p_from and p_to
  union all
  -- مرفقات الصيانة (معطّلة افتراضياً)
  select 'vehicle_maintenance_attachments', va.id::text, va.created_at::date, 'maintenance-attachments', va.storage_path, null::text
  from public.vehicle_maintenance_attachments va
  where en_maint and va.created_at::date between p_from and p_to
  union all
  -- صور الآليات (معطّلة افتراضياً) — الآليات المؤرشفة فقط
  select 'garage_vehicles', v.id::text, v.created_at::date, 'garage-vehicles', v.image_path,
         case when v.archived_at is null then 'آلية قيد الخدمة' end
  from public.garage_vehicles v
  where en_veh and v.image_path is not null and v.created_at::date between p_from and p_to
  union all
  -- مستندات الموظفين (معطّلة افتراضياً)
  select 'employee_documents', ed.id::text, ed.created_at::date, 'employee-documents', ed.storage_path, null::text
  from public.employee_documents ed
  where en_emp and ed.created_at::date between p_from and p_to
  union all
  -- أغلفة الإعلام (معطّلة افتراضياً) — المؤرشفة فقط
  select 'media_covers', mc.id::text, mc.created_at::date, 'media-photos', mc.storage_path,
         case when mc.status <> 'archived' then 'غلاف فعّال' end
  from public.media_covers mc
  where en_cov and mc.created_at::date between p_from and p_to;
end$$;

-- حجم الملف من فهرس التخزين (قد يكون null إن لم يُسجَّل)
create or replace function app.cold_archive_object_size(p_bucket text, p_path text) returns bigint
language sql stable security definer set search_path = public, storage as $$
  select (o.metadata ->> 'size')::bigint from storage.objects o where o.bucket_id = p_bucket and o.name = p_path limit 1
$$;

-- ─────────────── ④ المعاينة ───────────────
create or replace function public.cold_archive_preview(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare rows_ jsonb; tot jsonb;
begin
  perform app.require_it();
  if p_from is null or p_to is null or p_to < p_from then raise exception 'COLD_ARCHIVE_INPUT_INVALID: period'; end if;
  with c as (
    select c.*, app.cold_archive_object_size(c.bucket, c.storage_path) as size_bytes,
           exists (select 1 from public.cold_archive_items i where i.bucket = c.bucket and i.storage_path = c.storage_path
                   and exists (select 1 from public.cold_archive_packages p where p.id = i.package_id and p.status <> 'cancelled')) as already   -- يشمل اليتيم (missing): لا يُعاد إدراجه
    from app.cold_archive_collect(p_from, p_to) c
  ), per as (
    select source_key,
           count(*) filter (where excluded_reason is null and not already) as files,
           coalesce(sum(size_bytes) filter (where excluded_reason is null and not already), 0) as bytes,
           count(*) filter (where excluded_reason is not null and not already) as protected,
           count(*) filter (where already) as already_archived,
           jsonb_agg(distinct excluded_reason) filter (where excluded_reason is not null) as reasons
    from c group by source_key
  )
  select coalesce(jsonb_agg(jsonb_build_object('source_key', source_key, 'files', files, 'bytes', bytes, 'protected', protected,
                                               'already_archived', already_archived, 'reasons', coalesce(reasons, '[]'::jsonb)) order by bytes desc), '[]'::jsonb),
         jsonb_build_object('files', coalesce(sum(files), 0), 'bytes', coalesce(sum(bytes), 0), 'protected', coalesce(sum(protected), 0), 'already_archived', coalesce(sum(already_archived), 0))
    into rows_, tot from per;
  return jsonb_build_object('period_from', p_from, 'period_to', p_to, 'sources', rows_, 'totals', tot);
end$$;

-- ─────────────── ⑤ إنشاء الحزمة (تثبيت القائمة) ───────────────
create or replace function public.cold_archive_package_create(p_from date, p_to date, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare s public.cold_archive_settings; pk public.cold_archive_packages; n int; b bigint;
begin
  perform app.require_it();
  if p_from is null or p_to is null or p_to < p_from then raise exception 'COLD_ARCHIVE_INPUT_INVALID: period'; end if;
  if p_to >= current_date then raise exception 'COLD_ARCHIVE_PERIOD_NOT_CLOSED'; end if;   -- لا نؤرشف يوماً لم ينتهِ
  select * into s from public.cold_archive_settings where id = 1;
  insert into public.cold_archive_packages (code, period_from, period_to, note, required_copies, grace_days, created_by)
  values ('PKG-' || to_char(p_from, 'YYYY-MM-DD') || '_' || to_char(p_to, 'YYYY-MM-DD') || '-' || lpad(nextval('public.cold_archive_pkg_seq')::text, 3, '0'),
          p_from, p_to, nullif(trim(coalesce(p_note, '')), ''), s.required_copies, s.grace_days, auth.uid())
  returning * into pk;
  insert into public.cold_archive_items (package_id, source_key, record_id, record_date, bucket, storage_path, size_bytes)
  select pk.id, c.source_key, c.record_id, c.record_date, c.bucket, c.storage_path, app.cold_archive_object_size(c.bucket, c.storage_path)
  from app.cold_archive_collect(p_from, p_to) c
  where c.excluded_reason is null
    and not exists (select 1 from public.cold_archive_items i join public.cold_archive_packages p on p.id = i.package_id
                    where i.bucket = c.bucket and i.storage_path = c.storage_path and p.status <> 'cancelled')
  on conflict (package_id, bucket, storage_path) do nothing;
  select count(*), coalesce(sum(size_bytes), 0) into n, b from public.cold_archive_items where package_id = pk.id;
  if n = 0 then
    delete from public.cold_archive_packages where id = pk.id;
    raise exception 'COLD_ARCHIVE_EMPTY';
  end if;
  update public.cold_archive_packages set file_count = n, total_bytes = b where id = pk.id returning * into pk;
  perform app.cold_archive_log(pk.id, 'created', jsonb_build_object('code', pk.code, 'files', n, 'bytes', b, 'from', p_from, 'to', p_to));
  return app.cold_archive_package_json(pk);
end$$;

create or replace function app.cold_archive_package_json(p public.cold_archive_packages) returns jsonb
language sql stable security definer set search_path = public, app as $$
  select to_jsonb(p) || jsonb_build_object(
    'created_by_name', app.user_display_name(p.created_by),
    'copies', coalesce((select jsonb_agg(jsonb_build_object('disk_label', c.disk_label, 'ok_count', c.ok_count, 'verified_at', c.verified_at, 'verified_by_name', app.user_display_name(c.verified_by)) order by c.verified_at)
                        from public.cold_archive_copies c where c.package_id = p.id), '[]'::jsonb),
    'by_source', coalesce((select jsonb_agg(jsonb_build_object('source_key', i.source_key, 'files', i.n, 'bytes', i.b) order by i.b desc)
                           from (select source_key, count(*) n, coalesce(sum(size_bytes), 0) b from public.cold_archive_items where package_id = p.id group by source_key) i), '[]'::jsonb),
    'can_purge', p.status = 'verified' and p.verified_copies >= p.required_copies and p.purge_available_at is not null and now() >= p.purge_available_at)
$$;

create or replace function public.cold_archive_packages_list() returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
begin
  perform app.require_it();
  return coalesce((select jsonb_agg(app.cold_archive_package_json(p) order by p.created_at desc) from public.cold_archive_packages p), '[]'::jsonb);
end$$;

create or replace function public.cold_archive_package_get(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare pk public.cold_archive_packages;
begin
  perform app.require_it();
  select * into pk from public.cold_archive_packages where id = p_id;
  if not found then raise exception 'COLD_ARCHIVE_NOT_FOUND'; end if;
  return app.cold_archive_package_json(pk) || jsonb_build_object('events',
    coalesce((select jsonb_agg(jsonb_build_object('action', e.action, 'details', e.details, 'actor_name', e.actor_name, 'at', e.created_at) order by e.id)
              from public.cold_archive_events e where e.package_id = p_id), '[]'::jsonb));
end$$;

-- قائمة العناصر للأداة (ترقيم بالمعرّف)
create or replace function public.cold_archive_items_list(p_package uuid, p_after bigint default 0, p_limit int default 1000)
returns table (id bigint, source_key text, record_id text, record_date date, bucket text, storage_path text, size_bytes bigint, sha256 text, status text)
language plpgsql stable security definer set search_path = public, app as $$
begin
  perform app.require_it();
  return query select i.id, i.source_key, i.record_id, i.record_date, i.bucket, i.storage_path, i.size_bytes, i.sha256, i.status
    from public.cold_archive_items i where i.package_id = p_package and i.id > coalesce(p_after, 0) order by i.id limit least(greatest(coalesce(p_limit, 1000), 1), 5000);
end$$;

create or replace function public.cold_archive_package_cancel(p_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare pk public.cold_archive_packages;
begin
  perform app.require_it();
  select * into pk from public.cold_archive_packages where id = p_id for update;
  if not found then raise exception 'COLD_ARCHIVE_NOT_FOUND'; end if;
  if pk.status in ('purging', 'purged') then raise exception 'COLD_ARCHIVE_STATE_INVALID'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'COLD_ARCHIVE_REASON_REQUIRED'; end if;
  update public.cold_archive_packages set status = 'cancelled', cancelled_at = now() where id = p_id returning * into pk;
  perform app.cold_archive_log(p_id, 'cancelled', jsonb_build_object('reason', trim(p_reason)));
  return app.cold_archive_package_json(pk);
end$$;

-- ─────────────── ⑥ تسجيل التنزيل (البصمة + الحجم) ───────────────
-- p_items: [{path, bucket, sha256, bytes}] — الأداة تُبلّغ بعد كل دفعة
create or replace function public.cold_archive_items_downloaded(p_package uuid, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare pk public.cold_archive_packages; it jsonb; n int := 0; bad int := 0;
begin
  perform app.require_it();
  select * into pk from public.cold_archive_packages where id = p_package for update;
  if not found then raise exception 'COLD_ARCHIVE_NOT_FOUND'; end if;
  if pk.status not in ('ready', 'verified') then raise exception 'COLD_ARCHIVE_STATE_INVALID'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'COLD_ARCHIVE_INPUT_INVALID: items'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    if (it ->> 'sha256') !~ '^[0-9a-f]{64}$' then bad := bad + 1; continue; end if;
    update public.cold_archive_items i
       set sha256 = it ->> 'sha256', size_bytes = coalesce((it ->> 'bytes')::bigint, i.size_bytes), status = 'downloaded', downloaded_at = now()
     where i.package_id = p_package and i.bucket = it ->> 'bucket' and i.storage_path = it ->> 'path' and i.status in ('listed', 'downloaded');
    if found then n := n + 1; end if;
  end loop;
  update public.cold_archive_packages set downloaded_count = (select count(*) from public.cold_archive_items where package_id = p_package and status = 'downloaded') where id = p_package;
  return jsonb_build_object('updated', n, 'rejected', bad);
end$$;

-- ملف غير موجود في التخزين أصلاً (سجل يتيم) — يُستثنى من الحزمة
create or replace function public.cold_archive_item_missing(p_package uuid, p_bucket text, p_path text) returns void
language plpgsql security definer set search_path = public, app as $$
begin
  perform app.require_it();
  update public.cold_archive_items set status = 'missing' where package_id = p_package and bucket = p_bucket and storage_path = p_path and status = 'listed';
  update public.cold_archive_packages p set file_count = (select count(*) from public.cold_archive_items where package_id = p_package and status <> 'missing'),
         total_bytes = (select coalesce(sum(size_bytes), 0) from public.cold_archive_items where package_id = p_package and status <> 'missing') where p.id = p_package;
  perform app.cold_archive_log(p_package, 'item_missing', jsonb_build_object('bucket', p_bucket, 'path', p_path));
end$$;

-- ─────────────── ⑦ التحقق من نسخة قرص ───────────────
-- p_ok_hashes: [{path, bucket, sha256}] — البصمات المحسوبة من القرص. يُقبل فقط إن غطّت كل العناصر وطابقت المسجّل.
create or replace function public.cold_archive_copy_verify(p_package uuid, p_disk_label text, p_ok_hashes jsonb) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare pk public.cold_archive_packages; total int; matched int; not_downloaded int;
begin
  perform app.require_it();
  select * into pk from public.cold_archive_packages where id = p_package for update;
  if not found then raise exception 'COLD_ARCHIVE_NOT_FOUND'; end if;
  if pk.status not in ('ready', 'verified') then raise exception 'COLD_ARCHIVE_STATE_INVALID'; end if;
  if length(trim(coalesce(p_disk_label, ''))) < 1 then raise exception 'COLD_ARCHIVE_INPUT_INVALID: disk_label'; end if;
  if jsonb_typeof(p_ok_hashes) <> 'array' then raise exception 'COLD_ARCHIVE_INPUT_INVALID: hashes'; end if;
  select count(*) filter (where status <> 'missing'), count(*) filter (where status = 'listed') into total, not_downloaded from public.cold_archive_items where package_id = p_package;
  if not_downloaded > 0 then raise exception 'COLD_ARCHIVE_NOT_FULLY_DOWNLOADED: % ملف لم يُنزَّل بعد', not_downloaded; end if;
  with h as (select x ->> 'bucket' b, x ->> 'path' p, x ->> 'sha256' s from jsonb_array_elements(p_ok_hashes) x)
  select count(*) into matched from public.cold_archive_items i join h on h.b = i.bucket and h.p = i.storage_path and h.s = i.sha256
  where i.package_id = p_package and i.status = 'downloaded';
  if matched < total then
    perform app.cold_archive_log(p_package, 'copy_verify_failed', jsonb_build_object('disk_label', trim(p_disk_label), 'matched', matched, 'total', total));
    raise exception 'COLD_ARCHIVE_VERIFY_MISMATCH: % من % مطابق', matched, total;
  end if;
  insert into public.cold_archive_copies (package_id, disk_label, ok_count, verified_by)
  values (p_package, trim(p_disk_label), matched, auth.uid())
  on conflict (package_id, disk_label) do update set ok_count = excluded.ok_count, verified_by = excluded.verified_by, verified_at = now();
  update public.cold_archive_packages p
     set verified_copies = (select count(*) from public.cold_archive_copies c where c.package_id = p_package),
         status = case when (select count(*) from public.cold_archive_copies c where c.package_id = p_package) >= p.required_copies then 'verified' else p.status end,
         verified_at = case when (select count(*) from public.cold_archive_copies c where c.package_id = p_package) >= p.required_copies then coalesce(p.verified_at, now()) else p.verified_at end,
         purge_available_at = case when (select count(*) from public.cold_archive_copies c where c.package_id = p_package) >= p.required_copies then coalesce(p.purge_available_at, now() + make_interval(days => p.grace_days)) else p.purge_available_at end
   where p.id = p_package returning * into pk;
  perform app.cold_archive_log(p_package, 'copy_verified', jsonb_build_object('disk_label', trim(p_disk_label), 'matched', matched, 'copies', pk.verified_copies, 'required', pk.required_copies));
  return app.cold_archive_package_json(pk);
end$$;

-- ─────────────── ⑧ الحذف: بدء (قفل + قائمة) ثم تأكيد ───────────────
create or replace function public.cold_archive_purge_begin(p_package uuid) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare pk public.cold_archive_packages;
begin
  perform app.require_it();
  select * into pk from public.cold_archive_packages where id = p_package for update;
  if not found then raise exception 'COLD_ARCHIVE_NOT_FOUND'; end if;
  if pk.status = 'purging' then return app.cold_archive_package_json(pk); end if;   -- استئناف
  if pk.status <> 'verified' then raise exception 'COLD_ARCHIVE_NOT_VERIFIED'; end if;
  if pk.verified_copies < pk.required_copies then raise exception 'COLD_ARCHIVE_COPIES_INSUFFICIENT'; end if;
  if pk.purge_available_at is null or now() < pk.purge_available_at then raise exception 'COLD_ARCHIVE_GRACE_ACTIVE'; end if;
  update public.cold_archive_packages set status = 'purging', purge_started_by = auth.uid(), purge_started_at = now() where id = p_package returning * into pk;
  perform app.cold_archive_log(p_package, 'purge_started', jsonb_build_object('files', pk.file_count));
  return app.cold_archive_package_json(pk);
end$$;

-- p_removed: [{bucket, path}] — ما حُذف فعلاً من التخزين في هذه الدفعة
create or replace function public.cold_archive_purge_confirm(p_package uuid, p_removed jsonb) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare pk public.cold_archive_packages; n int; remaining int;
begin
  perform app.require_it();
  select * into pk from public.cold_archive_packages where id = p_package for update;
  if not found then raise exception 'COLD_ARCHIVE_NOT_FOUND'; end if;
  if pk.status <> 'purging' then raise exception 'COLD_ARCHIVE_STATE_INVALID'; end if;
  if jsonb_typeof(p_removed) <> 'array' then raise exception 'COLD_ARCHIVE_INPUT_INVALID: removed'; end if;
  with r as (select x ->> 'bucket' b, x ->> 'path' p from jsonb_array_elements(p_removed) x)
  update public.cold_archive_items i set status = 'purged', purged_at = now()
    from r where i.package_id = p_package and i.bucket = r.b and i.storage_path = r.p and i.status = 'downloaded';
  get diagnostics n = row_count;
  select count(*) into remaining from public.cold_archive_items where package_id = p_package and status = 'downloaded';
  update public.cold_archive_packages p
     set purged_count = (select count(*) from public.cold_archive_items where package_id = p_package and status = 'purged'),
         status = case when remaining = 0 then 'purged' else 'purging' end,
         purged_at = case when remaining = 0 then now() else null end
   where p.id = p_package returning * into pk;
  perform app.cold_archive_log(p_package, case when remaining = 0 then 'purge_completed' else 'purge_batch' end, jsonb_build_object('removed', n, 'remaining', remaining));
  return app.cold_archive_package_json(pk);
end$$;

-- ─────────────── ⑨ استعلام البطاقة: أين هذا الملف الآن؟ (لكل البوابات) ───────────────
-- يعيد للمسارات المحذوفة فقط: كود الحزمة والأقراص وتاريخ الحذف. متاح لكل مستخدم مسجّل لأن المسار بحد ذاته لا يحمل بيانات.
create or replace function public.cold_archive_lookup(p_bucket text, p_paths text[]) returns jsonb
language sql stable security definer set search_path = public, app as $$
  select coalesce(jsonb_object_agg(i.storage_path, jsonb_build_object(
           'package_code', p.code, 'purged_at', i.purged_at, 'period_from', p.period_from, 'period_to', p.period_to,
           'disks', coalesce((select jsonb_agg(c.disk_label order by c.verified_at) from public.cold_archive_copies c where c.package_id = p.id), '[]'::jsonb))), '{}'::jsonb)
  from public.cold_archive_items i join public.cold_archive_packages p on p.id = i.package_id
  where auth.uid() is not null and i.bucket = p_bucket and i.storage_path = any(p_paths) and i.status = 'purged'
$$;

-- ─────────────── الصلاحيات ───────────────
revoke all on function public.cold_archive_settings_get() from public, anon;
revoke all on function public.cold_archive_settings_set(int, int, jsonb, jsonb) from public, anon;
revoke all on function public.cold_archive_preview(date, date) from public, anon;
revoke all on function public.cold_archive_package_create(date, date, text) from public, anon;
revoke all on function public.cold_archive_packages_list() from public, anon;
revoke all on function public.cold_archive_package_get(uuid) from public, anon;
revoke all on function public.cold_archive_items_list(uuid, bigint, int) from public, anon;
revoke all on function public.cold_archive_package_cancel(uuid, text) from public, anon;
revoke all on function public.cold_archive_items_downloaded(uuid, jsonb) from public, anon;
revoke all on function public.cold_archive_item_missing(uuid, text, text) from public, anon;
revoke all on function public.cold_archive_copy_verify(uuid, text, jsonb) from public, anon;
revoke all on function public.cold_archive_purge_begin(uuid) from public, anon;
revoke all on function public.cold_archive_purge_confirm(uuid, jsonb) from public, anon;
revoke all on function public.cold_archive_lookup(text, text[]) from public, anon;
grant execute on function public.cold_archive_settings_get() to authenticated;
grant execute on function public.cold_archive_settings_set(int, int, jsonb, jsonb) to authenticated;
grant execute on function public.cold_archive_preview(date, date) to authenticated;
grant execute on function public.cold_archive_package_create(date, date, text) to authenticated;
grant execute on function public.cold_archive_packages_list() to authenticated;
grant execute on function public.cold_archive_package_get(uuid) to authenticated;
grant execute on function public.cold_archive_items_list(uuid, bigint, int) to authenticated;
grant execute on function public.cold_archive_package_cancel(uuid, text) to authenticated;
grant execute on function public.cold_archive_items_downloaded(uuid, jsonb) to authenticated;
grant execute on function public.cold_archive_item_missing(uuid, text, text) to authenticated;
grant execute on function public.cold_archive_copy_verify(uuid, text, jsonb) to authenticated;
grant execute on function public.cold_archive_purge_begin(uuid) to authenticated;
grant execute on function public.cold_archive_purge_confirm(uuid, jsonb) to authenticated;
grant execute on function public.cold_archive_lookup(text, text[]) to authenticated;
