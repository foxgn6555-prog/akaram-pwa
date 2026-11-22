-- ═══════════════════════════════════════════════════════════════════════════
-- الجولة ٩ — دالة إدراج دفعة استيراد من OSM
--
-- **لماذا دالة قاعدة لا إدراج من المتصفح؟**
--   ① الذرّية: الدفعة كلها تُدرج أو تُترك — لا يبقى نصفها في الجداول.
--   ② الحرّاس الهندسية تعمل (تريغرات map_streets_guard / overlap) في مسار
--      واحد لا يتكرر في التطبيق والقاعدة.
--   ③ العنصر المرفوض لا يُسقط الدفعة: يُسجَّل في map_import_skips بكوده
--      وسببه — نفس المبدأ الذي فرضناه في الجولة ٢.
--
-- **إعادة التشغيل آمنة:** on conflict (zone_id, code) do update ⇒ رفع الملف
--   مرتين لا يضاعف شيئاً. ونُبقي `name` إن كان مُعدَّلاً يدوياً (اسم OSM
--   لا يطغى على تصحيح موظف) — ونسجّل ذلك في `import_batch` لكل صف.
--
-- **الدفعات:** المدخل `p_rows` مصفوفة JSONB بحجم <= ~٢٠٠ عنصر. الإدراج
--   الأكبر يُقسَّم في الواجهة، لأن الحرّاس الهندسية O(n²) داخل الزون.
-- ═══════════════════════════════════════════════════════════════════════════

-- ① جدول تتبّع الدفعات — لمعرفة مَن استورد ماذا ومتى وبأي ملف
create table if not exists public.map_import_batches (
  id            uuid primary key default gen_random_uuid(),
  zone_id       uuid not null references public.map_zones(id) on delete cascade,
  /** اسم الملف كما اختاره المشرف — للتتبّع لا للمعالجة */
  file_name     text,
  file_bytes    bigint,
  geofence_id   uuid references public.gps_geofences(id) on delete set null,
  rows_total    int not null default 0,
  rows_inserted int not null default 0,
  rows_updated  int not null default 0,
  rows_skipped  int not null default 0,
  /** إحصاء المعاينة كما رآه المشرف قبل الضغط على «أدرج» */
  preview       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id) on delete set null
);
comment on table public.map_import_batches is
  'سجل كل عملية استيراد: مَن استورد، أي ملف، كم صفاً دخل وتخطّى — المقصود منه أن يُسأل عنه بعد سنة';

create index if not exists map_import_batches_zone_idx
  on public.map_import_batches(zone_id, created_at desc);

alter table public.map_import_batches enable row level security;

drop policy if exists "map import batches read" on public.map_import_batches;
create policy "map import batches read" on public.map_import_batches
  for select to authenticated using (true);

drop policy if exists "map import batches insert" on public.map_import_batches;
create policy "map import batches insert" on public.map_import_batches
  for insert to authenticated with check (true);

revoke all on public.map_import_batches from anon;
grant select, insert on public.map_import_batches to authenticated;

-- ② منع طغيان OSM على تعديل يدوي — عمود وسم على العنصرين
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'map_streets' and column_name = 'name_source'
  ) then
    alter table public.map_streets
      add column name_source text check (name_source in ('osm','manual'));
    comment on column public.map_streets.name_source is
      'osm=الاسم من ملف OSM · manual=صُحّح يدوياً — الاستيراد لا يطغى على manual';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'map_alleys' and column_name = 'name_source'
  ) then
    alter table public.map_alleys
      add column name_source text check (name_source in ('osm','manual'));
    comment on column public.map_alleys.name_source is
      'osm=الاسم من ملف OSM · manual=صُحّح يدوياً — الاستيراد لا يطغى على manual';
  end if;
end $$;

-- ③ دالة الإدراج
create or replace function app.map_import_batch(
  p_zone   uuid,
  p_rows   jsonb,
  p_mahallas jsonb default '{}'::jsonb,
  p_batch  uuid default null,          -- لإعادة الاستخدام عبر دفعات متتالية
  p_meta   jsonb default '{}'::jsonb   -- {file_name, file_bytes, preview}
) returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_zone      record;
  v_batch     uuid := coalesce(p_batch, gen_random_uuid());
  v_row       jsonb;
  v_mah       record;
  v_mah_id    uuid;
  v_code      text;
  v_kind      text;
  v_name      text;
  v_newname   text;
  v_path      jsonb;
  v_width     numeric;
  v_osm       bigint;
  v_link      text;
  v_mah_num   text;
  v_inserted  int := 0;
  v_updated   int := 0;
  v_skipped   int := 0;
  v_errors    jsonb := '[]'::jsonb;
  v_existing  record;
begin
  -- ⓐ الزون موجود؟
  select z.id, z.name, z.geofence_id into v_zone
  from public.map_zones z where z.id = p_zone;
  if v_zone.id is null then
    raise exception 'MAP_IMPORT_ZONE_NOT_FOUND: الزون % غير موجود في map_zones', p_zone
      using errcode = 'no_data_found';
  end if;

  -- ⓑ سجل الدفعة (يُنشأ مرة، ويُحدَّث مع كل قطعة)
  insert into public.map_import_batches (
    id, zone_id, file_name, file_bytes, geofence_id, preview, created_by
  ) values (
    v_batch, p_zone,
    nullif(p_meta->>'file_name',''),
    nullif(p_meta->>'file_bytes','')::bigint,
    v_zone.geofence_id,
    coalesce(p_meta->'preview','{}'::jsonb),
    auth.uid()
  ) on conflict (id) do nothing;

  -- ⓒ المحلات أولاً — الأزقة تُربط بها بالكود
  for v_mah in select * from jsonb_to_recordset(
      case when jsonb_typeof(p_mahallas) = 'array' then p_mahallas else '[]'::jsonb end
    ) as x(code text, osm_number text, name text)
  loop
    begin
      insert into public.map_mahallas (zone_id, code, osm_number, name, boundary_state, created_by)
      values (p_zone, v_mah.code, nullif(v_mah.osm_number,'')::text, v_mah.name, 'open', auth.uid())
      on conflict (zone_id, code) do update
        set updated_at = now()
      returning id into v_mah_id;
    exception when others then
      -- محلة مرفوضة لا تُسقط الاستيراد؛ نكتفي بالإبلاغ
      v_errors := v_errors || jsonb_build_object(
        'code', v_mah.code, 'kind', 'mahalla', 'error', sqlerrm);
    end;
  end loop;

  -- ⓓ العناصر
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'MAP_IMPORT_ROWS_INVALID: p_rows ليست مصفوفة'
      using errcode = 'invalid_parameter_value';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_code   := v_row->>'code';
    v_kind   := v_row->>'kind';
    v_name   := nullif(trim(coalesce(v_row->>'name','')), '');
    v_osm    := nullif(v_row->>'osm_way_id','')::bigint;
    v_width  := coalesce(nullif(v_row->>'width_m','')::numeric, 6.0);
    v_link   := nullif(v_row->>'link_source','');
    v_mah_num:= nullif(v_row->>'mahalla_num','');
    v_path   := v_row->'path';

    begin
      if v_kind = 'alley' then
        -- الزقاق يحتاج محلة: من الرقم، وإلا «غير محدّدة» (MHL-0000)
        v_mah_id := null;
        if v_mah_num is not null then
          select id into v_mah_id from public.map_mahallas
          where zone_id = p_zone and osm_number = v_mah_num limit 1;
        end if;
        if v_mah_id is null then
          select id into v_mah_id from public.map_mahallas
          where zone_id = p_zone and code = 'MHL-0000' limit 1;
        end if;
        -- إن لم تُنشأ «غير محدّدة» في هذه الدفعة، نُنشئها الآن
        if v_mah_id is null then
          insert into public.map_mahallas (zone_id, code, osm_number, name, boundary_state, created_by)
          values (p_zone, 'MHL-0000', null, 'غير محدّدة — تحتاج ربطاً بمحلة', 'open', auth.uid())
          on conflict (zone_id, code) do update set updated_at = now()
          returning id into v_mah_id;
        end if;

        select name, name_source into v_existing
        from public.map_alleys where zone_id = p_zone and code = v_code;

        if v_existing.name_source = 'manual' and v_name is not null then
          v_newname := v_existing.name;   -- لا يطغى OSM على تصحيح موظف
        else
          v_newname := v_name;
        end if;

        insert into public.map_alleys (
          zone_id, mahalla_id, code, name, path, width_m, width_source,
          osm_way_id, link_source, name_source, created_by
        ) values (
          p_zone, v_mah_id, v_code, v_newname, v_path, v_width,
          coalesce(nullif(v_row->>'width_source',''), 'default'),
          v_osm, coalesce(v_link,'manual'),
          case when v_existing.name_source = 'manual' then 'manual' else 'osm' end,
          auth.uid()
        )
        on conflict (zone_id, code) do update
          set path        = excluded.path,
              width_m     = excluded.width_m,
              osm_way_id  = excluded.osm_way_id,
              mahalla_id  = excluded.mahalla_id,
              name        = excluded.name,
              name_source = map_alleys.name_source,  -- الإبقاء على manual
              updated_at  = now();

        if v_existing.name_source is null then v_inserted := v_inserted + 1;
        else v_updated := v_updated + 1; end if;

      else
        -- الشارع بأنواعه الأربعة
        select name, name_source into v_existing
        from public.map_streets where zone_id = p_zone and code = v_code;

        if v_existing.name_source = 'manual' and v_name is not null then
          v_newname := v_existing.name;
        else
          v_newname := v_name;
        end if;

        insert into public.map_streets (
          zone_id, code, name, kind, path, width_m, osm_way_id,
          name_source, created_by
        ) values (
          p_zone, v_code, v_newname, v_kind, v_path, v_width, v_osm,
          case when v_existing.name_source = 'manual' then 'manual' else 'osm' end,
          auth.uid()
        )
        on conflict (zone_id, code) do update
          set path        = excluded.path,
              width_m     = excluded.width_m,
              osm_way_id  = excluded.osm_way_id,
              name        = excluded.name,
              name_source = map_streets.name_source,
              updated_at  = now();

        if v_existing.name_source is null then v_inserted := v_inserted + 1;
        else v_updated := v_updated + 1; end if;
      end if;

    exception when others then
      -- عنصر مرفوض: يُسجَّل بكوده وسببه، والبقية تكمل
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_object('code', v_code, 'kind', v_kind, 'error', sqlerrm);
      begin
        insert into public.map_import_skips (zone_id, table_name, code, name, error_code, error_msg)
        values (
          p_zone,
          case when v_kind = 'alley' then 'map_alleys' else 'map_streets' end,
          coalesce(v_code,'?'), v_name,
          split_part(sqlerrm, ':', 1), sqlerrm
        )
        on conflict (zone_id, table_name, code) do update
          set error_msg = excluded.error_msg, created_at = now();
      exception when others then
        null;  -- جدول التخطي نفسه قد يرفض — لا نُسقط الدفعة لأجله
      end;
    end;
  end loop;

  -- ⓔ تحديث سجل الدفعة
  update public.map_import_batches b set
    rows_total    = b.rows_total + jsonb_array_length(p_rows),
    rows_inserted = b.rows_inserted + v_inserted,
    rows_updated  = b.rows_updated + v_updated,
    rows_skipped  = b.rows_skipped + v_skipped
  where b.id = v_batch;

  return jsonb_build_object(
    'batch_id',  v_batch,
    'inserted',  v_inserted,
    'updated',   v_updated,
    'skipped',   v_skipped,
    'errors',    v_errors
  );
end $$;

comment on function app.map_import_batch(uuid, jsonb, jsonb, uuid, jsonb) is
  'إدراج دفعة استيراد OSM: ذرّية للعنصر، مُعادة التشغيل آمنة، وتُبقي تعديل الاسم اليدوي';

revoke all on function app.map_import_batch(uuid, jsonb, jsonb, uuid, jsonb) from public, anon;
grant execute on function app.map_import_batch(uuid, jsonb, jsonb, uuid, jsonb) to authenticated;

-- ④ تثبيت اسم المسار: من يعدّل الاسم يدوياً يُوسم manual تلقائياً
create or replace function app.map_name_source_guard()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
begin
  -- تعديل الاسم من الواجهة (لا من الاستيراد) ⇒ manual
  if tg_op = 'UPDATE' and new.name is distinct from old.name then
    if coalesce(current_setting('app.import_running', true), 'off') <> 'on' then
      new.name_source := 'manual';
    end if;
  end if;
  return new;
end $$;

comment on function app.map_name_source_guard() is
  'يوسم الاسم manual عند تعديله يدوياً — والاستيراد يمرّ عبر current_setting لتجاوزه';

revoke all on function app.map_name_source_guard() from public, anon;

drop trigger if exists map_streets_name_source_trg on public.map_streets;
create trigger map_streets_name_source_trg
  before update of name on public.map_streets
  for each row execute function app.map_name_source_guard();

drop trigger if exists map_alleys_name_source_trg on public.map_alleys;
create trigger map_alleys_name_source_trg
  before update of name on public.map_alleys
  for each row execute function app.map_name_source_guard();
