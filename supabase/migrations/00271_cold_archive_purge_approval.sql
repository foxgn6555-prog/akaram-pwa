-- 00271 — الأرشيف البارد (٤/٤): الحذف من المنصة + موافقة ثنائية اختيارية + صلاحية حذف التخزين المحدودة
--  • إعداد اختياري purge_approval (افتراضي معطّل): عند تفعيله يطلب حساب IT الحذف ويوافق حساب IT **آخر** قبل فتح الزر.
--  • الحذف الفعلي من التخزين يتم من واجهة IT بصلاحية محدودة: ملف مُدرج (downloaded) في حزمة بحالة purging فقط.
--  • البيانات النصية لا تُمس؛ يُحذف الملف فقط ويبقى المسار في الحزمة للبطاقة.

alter table public.cold_archive_settings add column if not exists purge_approval boolean not null default false;
alter table public.cold_archive_packages
  add column if not exists purge_requested_by uuid references auth.users(id),
  add column if not exists purge_requested_at timestamptz,
  add column if not exists purge_approved_by  uuid references auth.users(id),
  add column if not exists purge_approved_at  timestamptz;

-- الإعدادات الفعّالة + الحفظ (توقيع جديد بوسيط اختياري، القديم يبقى يعمل)
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
  return jsonb_build_object('required_copies', s.required_copies, 'grace_days', s.grace_days, 'purge_approval', s.purge_approval,
                            'sources', src, 'protections', prot, 'updated_at', s.updated_at);
end$$;

drop function if exists public.cold_archive_settings_set(int, int, jsonb, jsonb);
create or replace function public.cold_archive_settings_set(p_required_copies int, p_grace_days int, p_sources jsonb, p_protections jsonb, p_purge_approval boolean default null)
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
         sources = clean_src, protections = clean_prot, purge_approval = coalesce(p_purge_approval, purge_approval), updated_by = auth.uid(), updated_at = now() where id = 1;
  perform app.cold_archive_log(null, 'settings_updated', jsonb_build_object('required_copies', p_required_copies, 'grace_days', p_grace_days, 'purge_approval', coalesce(p_purge_approval, false), 'sources', clean_src, 'protections', clean_prot));
  return app.cold_archive_effective_settings();
end$$;
grant execute on function public.cold_archive_settings_set(int, int, jsonb, jsonb, boolean) to authenticated;

-- JSON الحزمة: حالة الموافقة + أسماء + هل أنا الطالب
create or replace function app.cold_archive_package_json(p public.cold_archive_packages) returns jsonb
language sql stable security definer set search_path = public, app as $$
  select to_jsonb(p) || jsonb_build_object(
    'created_by_name', app.user_display_name(p.created_by),
    'purge_requested_by_name', app.user_display_name(p.purge_requested_by),
    'purge_approved_by_name', app.user_display_name(p.purge_approved_by),
    'purge_requested_by_me', p.purge_requested_by is not null and p.purge_requested_by = auth.uid(),
    'purge_approval_required', (select s.purge_approval from public.cold_archive_settings s where s.id = 1),
    'copies', coalesce((select jsonb_agg(jsonb_build_object('disk_label', c.disk_label, 'ok_count', c.ok_count, 'verified_at', c.verified_at, 'verified_by_name', app.user_display_name(c.verified_by)) order by c.verified_at)
                        from public.cold_archive_copies c where c.package_id = p.id), '[]'::jsonb),
    'by_source', coalesce((select jsonb_agg(jsonb_build_object('source_key', i.source_key, 'files', i.n, 'bytes', i.b) order by i.b desc)
                           from (select source_key, count(*) n, coalesce(sum(size_bytes), 0) b from public.cold_archive_items where package_id = p.id group by source_key) i), '[]'::jsonb),
    'can_purge', p.status = 'verified' and p.verified_copies >= p.required_copies and p.purge_available_at is not null and now() >= p.purge_available_at
                 and (not (select s.purge_approval from public.cold_archive_settings s where s.id = 1) or p.purge_approved_at is not null))
$$;

-- طلب الحذف (أي حساب IT) — يتطلب حزمة متحقَّق منها
create or replace function public.cold_archive_purge_request(p_package uuid) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare pk public.cold_archive_packages;
begin
  perform app.require_it();
  select * into pk from public.cold_archive_packages where id = p_package for update;
  if not found then raise exception 'COLD_ARCHIVE_NOT_FOUND'; end if;
  if pk.status <> 'verified' then raise exception 'COLD_ARCHIVE_NOT_VERIFIED'; end if;
  if pk.purge_requested_at is not null then return app.cold_archive_package_json(pk); end if;
  update public.cold_archive_packages set purge_requested_by = auth.uid(), purge_requested_at = now() where id = p_package returning * into pk;
  perform app.cold_archive_log(p_package, 'purge_requested', '{}'::jsonb);
  return app.cold_archive_package_json(pk);
end$$;

-- الموافقة على الحذف — حساب IT مختلف عن الطالب
create or replace function public.cold_archive_purge_approve(p_package uuid) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare pk public.cold_archive_packages;
begin
  perform app.require_it();
  select * into pk from public.cold_archive_packages where id = p_package for update;
  if not found then raise exception 'COLD_ARCHIVE_NOT_FOUND'; end if;
  if pk.status <> 'verified' then raise exception 'COLD_ARCHIVE_NOT_VERIFIED'; end if;
  if pk.purge_requested_at is null then raise exception 'COLD_ARCHIVE_NOT_REQUESTED'; end if;
  if pk.purge_requested_by = auth.uid() then raise exception 'COLD_ARCHIVE_SAME_APPROVER'; end if;
  if pk.purge_approved_at is not null then return app.cold_archive_package_json(pk); end if;
  update public.cold_archive_packages set purge_approved_by = auth.uid(), purge_approved_at = now() where id = p_package returning * into pk;
  perform app.cold_archive_log(p_package, 'purge_approved', '{}'::jsonb);
  return app.cold_archive_package_json(pk);
end$$;

-- بدء الحذف: يحترم الموافقة الثنائية إن كانت مفعّلة
create or replace function public.cold_archive_purge_begin(p_package uuid) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare pk public.cold_archive_packages; need_approval boolean;
begin
  perform app.require_it();
  select * into pk from public.cold_archive_packages where id = p_package for update;
  if not found then raise exception 'COLD_ARCHIVE_NOT_FOUND'; end if;
  if pk.status = 'purging' then return app.cold_archive_package_json(pk); end if;   -- استئناف
  if pk.status <> 'verified' then raise exception 'COLD_ARCHIVE_NOT_VERIFIED'; end if;
  if pk.verified_copies < pk.required_copies then raise exception 'COLD_ARCHIVE_COPIES_INSUFFICIENT'; end if;
  if pk.purge_available_at is null or now() < pk.purge_available_at then raise exception 'COLD_ARCHIVE_GRACE_ACTIVE'; end if;
  select purge_approval into need_approval from public.cold_archive_settings where id = 1;
  if need_approval and pk.purge_approved_at is null then raise exception 'COLD_ARCHIVE_APPROVAL_REQUIRED'; end if;
  update public.cold_archive_packages set status = 'purging', purge_started_by = auth.uid(), purge_started_at = now() where id = p_package returning * into pk;
  perform app.cold_archive_log(p_package, 'purge_started', jsonb_build_object('files', pk.file_count));
  return app.cold_archive_package_json(pk);
end$$;

-- صلاحية حذف التخزين: IT، ملف مُنزَّل، حزمة قيد الحذف
create or replace function app.cold_archive_object_purgeable(p_bucket text, p_name text) returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (
    select 1 from public.cold_archive_items i join public.cold_archive_packages p on p.id = i.package_id
    where i.bucket = p_bucket and i.storage_path = p_name and i.status = 'downloaded' and p.status = 'purging')
$$;
revoke all on function app.cold_archive_object_purgeable(text, text) from public;
grant execute on function app.cold_archive_object_purgeable(text, text) to authenticated;
drop policy if exists "cold-archive: IT purges packaged files" on storage.objects;
create policy "cold-archive: IT purges packaged files" on storage.objects for delete to authenticated
  using (app.has_role(array['it_admin', 'super_admin']) and app.cold_archive_object_purgeable(bucket_id, name));
-- حذف التخزين يستلزم select أيضاً على الصف أثناء الحذف — السياسة 00270 تغطي ready/verified؛ نوسّعها لتشمل purging
create or replace function app.cold_archive_object_in_active_package(p_bucket text, p_name text) returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (
    select 1 from public.cold_archive_items i join public.cold_archive_packages p on p.id = i.package_id
    where i.bucket = p_bucket and i.storage_path = p_name
      and i.status in ('listed', 'downloaded') and p.status in ('ready', 'verified', 'purging'))
$$;
grant execute on function public.cold_archive_purge_request(uuid) to authenticated;
grant execute on function public.cold_archive_purge_approve(uuid) to authenticated;
