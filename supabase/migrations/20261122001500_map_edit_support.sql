-- 20261122001500 — دعم التعديل اليدوي (الجولة ②)
--
-- عيبان حقيقيان كشفهما اختبار التعديل الفعلي على قاعدة كاملة بالهجرات:
--
--  ① `map_streets_kind_prefix` يربط الكود بالتصنيف:
--       (kind='primary' and code like 'STR-%') or (kind='secondary' and code like 'SEC-%') …
--     ⇒ بمجرد أن يصبح العنصر primary لا يمكن تحويله إلى secondary **أبداً**.
--     وتعديل التصنيف مطلب صريح في الجولة ②. القيد نفسه يمنع الميزة.
--
--     الإصلاح: الكود ثابت للعنصر لا للتصنيف. نُبقي البادئة صالحة (STR/SEC/TRC/LOC)
--     لكن لا نفرض تطابقها مع kind الحالي. البادئة تبقى أثراً لتاريخ التصنيف
--     عند الاستيراد، والتصنيف الحالي في عمود `kind` وحده.
--
--  ② لا شيء يمنع تعديل مسار خارج حدود الزون (اختُبر: قُبل مسار في 33.300
--     بينما السندباد 33.221–33.255). الحارس في الواجهة وحده لا يكفي:
--     أي استدعاء مباشر لـ PostgREST يتجاوزه.
--     الإصلاح: تريغر يرفض أي نقطة خارج مضلّع الزون (بتسامح ٥م كما في المستورد).
--
-- كل ما هنا إضافي وآمن للتشغيل المتكرر (idempotent).

-- ═══════════════════════════════════════════════════════════════════════════
-- ① الكود لا يحمل التصنيف
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.map_streets drop constraint if exists map_streets_kind_prefix;

alter table public.map_streets
  add constraint map_streets_code_prefix check (
    code ~ '^(STR|SEC|TRC|LOC)-[0-9]{4}$'
  );

comment on constraint map_streets_code_prefix on public.map_streets is
  'الكود ثابت للعنصر لا للتصنيف: البادئة أثر تاريخي من الاستيراد، وkind يمكن تغييره بحرية';

-- ═══════════════════════════════════════════════════════════════════════════
-- ② حارس حدود الزون على التعديل
--    لا يُشغَّل على الإدراج من الاستيراد (المستورد يقصّ أصلاً)، بل على UPDATE
--    فقط حين يتغيّر المسار — أخفّ وأدقّ.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function app.map_guard_path_in_zone()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_poly    jsonb;
  v_pt      jsonb;
  v_lat     float8;
  v_lng     float8;
  v_outside int := 0;
begin
  -- لا نفحص إلا حين يتغيّر المسار فعلاً
  if tg_op = 'UPDATE' and new.path is not distinct from old.path then
    return new;
  end if;

  select g.polygon into v_poly
  from public.map_zones z
  join public.gps_geofences g on g.id = z.geofence_id
  where z.id = new.zone_id;

  -- بلا مضلّع: لا شيء نفحصه — لا نُسقط العنصر بسبب نقص بيانات الحدود
  if v_poly is null or jsonb_array_length(v_poly) < 3 then
    return new;
  end if;

  -- ⚠ عيب كان هنا: `for v_pt in select * from jsonb_array_elements(…)`
  -- يُسنِد صفاً إلى متغيّر jsonb فيفشل التحويل ويُرفض كل مسار — حتى الداخلي.
  -- الصيغة الصحيحة: `for v_pt in select value from jsonb_array_elements(…)`.
  /**
   * ⚠ صيغتان في المنصة، ولا يصحّ أن يفترض الحارس واحدة:
   *   • `map_streets.path` / `map_alleys.path` ⇒ `[[lat,lng], …]`  (ما يخزّنه المستورد)
   *   • `gps_geofences.polygon`               ⇒ `[{lat,lng}, …]`
   * جمعتُهما في تحويل واحد صريح بدل الاعتماد على `->>` الذي يُرجع null للصيغة الأخرى
   * فيُرفض كل مسار (عيب وقع فعلاً في هذا الحارس وأوقف التعديل كله).
   */
  for v_pt in select value from jsonb_array_elements(new.path) loop
    if jsonb_typeof(v_pt) = 'array' then
      v_lat := (v_pt->>0)::float8;
      v_lng := (v_pt->>1)::float8;
    else
      v_lat := (v_pt->>'lat')::float8;
      v_lng := (v_pt->>'lng')::float8;
    end if;
    if v_lat is null or v_lng is null then
      raise exception 'MAP_BAD_POINT: نقطة بلا إحداثيات في % (الصيغة: %)', new.code, jsonb_typeof(v_pt)
        using errcode = 'check_violation';
    end if;
    if not app.gps_point_in_polygon(v_lat, v_lng, v_poly) then
      v_outside := v_outside + 1;
    end if;
  end loop;

  /**
   * التسامح: نقطة واحدة مركزها خارج المضلّع قد تكون على الحدّ تماماً
   * (المستورد يستخدم تسامح ٥م). لا نرفض إلا إذا كان **أكثر من نصف** النقاط
   * خارج الحدود — هذا يعني أن المشرف سحب المسار خارج الزون فعلاً، لا أن
   * حدوداً دقيقة أوقفت نقطة على الحافة.
   */
  if v_outside * 2 > jsonb_array_length(new.path) then
    raise exception 'MAP_OUTSIDE_ZONE: % من % نقطة خارج حدّ الزون — أعِد المسار للداخل',
      v_outside, jsonb_array_length(new.path)
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

comment on function app.map_guard_path_in_zone() is
  'يرفض تعديل مسار يُخرج أكثر من نصف نقاطه عن حدّ الزون — الواجهة تفحص أولاً، وهذا الحارس يمنع التجاوز';

drop trigger if exists map_streets_path_zone_guard on public.map_streets;
create trigger map_streets_path_zone_guard
  before update of path on public.map_streets
  for each row execute function app.map_guard_path_in_zone();

drop trigger if exists map_alleys_path_zone_guard on public.map_alleys;
create trigger map_alleys_path_zone_guard
  before update of path on public.map_alleys
  for each row execute function app.map_guard_path_in_zone();

-- ═══════════════════════════════════════════════════════════════════════════
-- ③ سجل التعديلات اليدوية — من عدّل ماذا ومتى
--    لم يكن هناك أثر: الاستيراد يسجَّل في map_import_batches، والتعديل اليدوي بلا سجل.
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.map_edit_log (
  id          uuid primary key default gen_random_uuid(),
  zone_id     uuid not null references public.map_zones(id) on delete cascade,
  table_name  text not null check (table_name in ('map_streets','map_alleys')),
  row_id      uuid not null,
  code        text not null,
  field       text not null,
  old_value   text,
  new_value   text,
  edited_by   uuid default auth.uid() references auth.users(id) on delete set null,
  edited_at   timestamptz not null default now()
);
comment on table public.map_edit_log is
  'أثر كل تعديل يدوي: من عدّل، ماذا، من أي قيمة إلى أي قيمة — لا تعديل بلا سجل';

create index if not exists map_edit_log_zone_idx on public.map_edit_log(zone_id, edited_at desc);
create index if not exists map_edit_log_row_idx on public.map_edit_log(row_id, edited_at desc);

alter table public.map_edit_log enable row level security;

drop policy if exists "map edit log read" on public.map_edit_log;
create policy "map edit log read" on public.map_edit_log for select to authenticated
  using (app.has_role(array['ops_room','it_admin','super_admin','sector_manager','deputy','executive']));

drop policy if exists "map edit log insert" on public.map_edit_log;
create policy "map edit log insert" on public.map_edit_log for insert to authenticated
  with check (app.has_role(array['ops_room','it_admin','super_admin']));

revoke all on public.map_edit_log from anon;
grant select, insert on public.map_edit_log to authenticated;

/**
 * يسجّل التعديلات الفعلية فقط (حقل تغيّر فعلاً).
 * لا يُسجَّل الاسم إن لم يتغيّر، ولا يُسجَّل المسار إن لم يتحرّك.
 */
create or replace function app.map_edit_log_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_table text := tg_table_name;
begin
  if new.name is distinct from old.name then
    insert into public.map_edit_log(zone_id, table_name, row_id, code, field, old_value, new_value)
    values (new.zone_id, v_table, new.id, new.code, 'name', old.name, new.name);
  end if;

  if new.path is distinct from old.path then
    insert into public.map_edit_log(zone_id, table_name, row_id, code, field, old_value, new_value)
    values (new.zone_id, v_table, new.id, new.code, 'path',
            round(app.map_line_length_m(old.path)::numeric, 1)::text || ' م',
            round(app.map_line_length_m(new.path)::numeric, 1)::text || ' م');
  end if;

  if tg_op = 'UPDATE' and new.kind is distinct from old.kind then
    insert into public.map_edit_log(zone_id, table_name, row_id, code, field, old_value, new_value)
    values (new.zone_id, v_table, new.id, new.code, 'kind', old.kind, new.kind);
  end if;

  if new.width_m is distinct from old.width_m then
    insert into public.map_edit_log(zone_id, table_name, row_id, code, field, old_value, new_value)
    values (new.zone_id, v_table, new.id, new.code, 'width_m', old.width_m::text, new.width_m::text);
  end if;

  return new;
end $$;

drop trigger if exists map_streets_edit_log on public.map_streets;
create trigger map_streets_edit_log
  after update on public.map_streets
  for each row execute function app.map_edit_log_trigger();

drop trigger if exists map_alleys_edit_log on public.map_alleys;
create trigger map_alleys_edit_log
  after update on public.map_alleys
  for each row execute function app.map_edit_log_trigger();
