-- ═══════════════════════════════════════════════════════════════════════════
-- 20261122001000 — تفضيلات تصدير Excel (المرحلة ⑦)
-- ═══════════════════════════════════════════════════════════════════════════
-- معيار القبول من الخطة: «ترتيب الأعمدة يُحفظ ويُسترجع».
-- الحفظ **لكل مستخدم** لا لكل جهة: مشرف غرفة العمليات ومفتّش الميدان
-- يحتاجان ترتيبين مختلفين، وفرض ترتيب واحد يجعل أحدهما يعيد الترتيب كل مرة.
--
-- الشكل: صف لكل (مستخدم، صنف تقرير) يحمل مصفوفة الأعمدة:
--   [{ "id": "place_code", "visible": true, "order": 0 }, …]
-- لا نُطبّعها إلى صف لكل عمود: الترتيب كتلة واحدة تُقرأ وتُكتب دائماً معاً،
-- وتطبيعها يضيف تعقيداً بلا فائدة (لا استعلام «من يستعمل العمود X» مطلوب).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.map_export_prefs (
  user_id    uuid not null references auth.users(id) on delete cascade,
  export_kind text not null check (export_kind in ('places','visits')),
  columns    jsonb not null default '[]'::jsonb
             check (jsonb_typeof(columns) = 'array'),
  updated_at timestamptz not null default now(),
  primary key (user_id, export_kind)
);
comment on table public.map_export_prefs is
  'ترتيب واختيار أعمدة تقرير التخطيط لكل مستخدم — «ترتيب محفوظ» كما تشترط الخطة';
comment on column public.map_export_prefs.columns is
  'مصفوفة [{id, visible, order}] — الترتيب كتلة واحدة تُقرأ وتُكتب معاً';

alter table public.map_export_prefs enable row level security;

-- كل مستخدم يقرأ ويكتب تفضيله وحده؛ لا قراءة لتفضيل غيره
drop policy if exists "map export prefs own" on public.map_export_prefs;
create policy "map export prefs own" on public.map_export_prefs
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.map_export_prefs from anon;
grant select, insert, update, delete on public.map_export_prefs to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- قراءة/كتابة عبر دالتين — تُغني الواجهة عن كتابة upsert يدوي وتضمن
-- أن user_id دائماً auth.uid() (لا يمكن انتحال تفضيل مستخدم آخر)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_export_prefs_get(p_kind text)
returns jsonb
language sql stable security definer set search_path = public, app as $$
  select coalesce(
    (select columns from public.map_export_prefs
      where user_id = auth.uid() and export_kind = p_kind),
    '[]'::jsonb)
$$;
comment on function app.map_export_prefs_get(text) is
  'تفضيل المستخدم الحالي للصنف — مصفوفة فارغة إن لم يحفظ بعد ⇒ الواجهة تستعمل الافتراضي';

create or replace function app.map_export_prefs_set(p_kind text, p_columns jsonb)
returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_kind not in ('places','visits') then
    raise exception 'EXPORT_KIND_INVALID: %', p_kind;
  end if;
  if jsonb_typeof(p_columns) <> 'array' then
    raise exception 'EXPORT_COLUMNS_INVALID: يجب مصفوفة';
  end if;
  -- حماية من تفضيل يُخفي كل الأعمدة: تقرير بلا أعمدة ليس تقريراً
  if not exists (
    select 1 from jsonb_array_elements(p_columns) e
     where coalesce((e->>'visible')::boolean, false)
  ) then
    raise exception 'EXPORT_COLUMNS_EMPTY: لا يمكن حفظ تفضيل بلا عمود مرئي';
  end if;

  insert into public.map_export_prefs(user_id, export_kind, columns, updated_at)
  values (v_uid, p_kind, p_columns, now())
  on conflict (user_id, export_kind)
  do update set columns = excluded.columns, updated_at = now();

  return p_columns;
end $$;
comment on function app.map_export_prefs_set(text, jsonb) is
  'حفظ تفضيل المستخدم — يرفض صنفاً مجهولاً أو مصفوفة تُخفي كل الأعمدة';

revoke all on function app.map_export_prefs_get(text) from public, anon;
revoke all on function app.map_export_prefs_set(text, jsonb) from public, anon;
grant execute on function app.map_export_prefs_get(text) to authenticated;
grant execute on function app.map_export_prefs_set(text, jsonb) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- سجل التصدير: من صدّر ماذا ومتى — للتدقيق لا للحجب
--   ملف يُرسل لجهة خارجية بلا أثر = لا يمكن تبريره لاحقاً
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.map_export_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete set null,
  zone_id    uuid references public.map_zones(id) on delete set null,
  export_kind text not null check (export_kind in ('places','visits')),
  day_from   date,
  day_to     date,
  row_count  integer not null default 0 check (row_count >= 0),
  columns    jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
comment on table public.map_export_log is
  'أثر كل تصدير Excel: المستخدم والزون واليوم وعدد الصفوف والأعمدة';
create index if not exists map_export_log_zone_idx on public.map_export_log(zone_id, created_at desc);

alter table public.map_export_log enable row level security;
drop policy if exists "map export log read" on public.map_export_log;
create policy "map export log read" on public.map_export_log for select to authenticated
  using (app.has_role(array['ops_room','it_admin','super_admin','sector_manager','deputy','executive']));
drop policy if exists "map export log write" on public.map_export_log;
create policy "map export log write" on public.map_export_log for insert to authenticated
  with check (user_id = auth.uid());
revoke all on public.map_export_log from anon;
grant select, insert on public.map_export_log to authenticated;

create or replace function app.map_export_log_add(
  p_zone uuid, p_kind text, p_from date, p_to date, p_rows integer, p_columns jsonb
) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare v_id uuid;
begin
  insert into public.map_export_log(user_id, zone_id, export_kind, day_from, day_to, row_count, columns)
  values (auth.uid(), p_zone, p_kind, p_from, p_to, greatest(coalesce(p_rows,0),0), coalesce(p_columns,'[]'::jsonb))
  returning id into v_id;
  return v_id;
end $$;
comment on function app.map_export_log_add(uuid,text,date,date,integer,jsonb) is
  'تسجيل تصدير — يُستدعى بعد بناء الملف بنجاح';

revoke all on function app.map_export_log_add(uuid,text,date,date,integer,jsonb) from public, anon;
grant execute on function app.map_export_log_add(uuid,text,date,date,integer,jsonb) to authenticated;
