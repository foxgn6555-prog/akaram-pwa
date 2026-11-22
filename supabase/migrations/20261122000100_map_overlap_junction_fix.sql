-- ═══════════════════════════════════════════════════════════════════════════
-- 20261122000100_map_overlap_junction_fix.sql
-- إصلاح قيد التقاطع بعد أن أثبت الاستيراد الحقيقي (٣٣٤ عنصراً) أنه صارم جداً.
--
-- ما اكتشفته فعلياً: أول محاولة تحميل أُسقطت بـ
--   MAP_OVERLAP: الشارع يتقاطع مع STR-0023 (شارع 3) في نفس الزون
-- والسبب حقيقي لا خطأ بيانات: **الشوارع في العالم الحقيقي تتقاطع عند المفترقات**.
-- منع أي تقاطع يمنع استيراد أي مدينة على الأرض.
--
-- القاعدة الصحيحة (وهي ما يفرّق التخطيط عن العشوائية):
--   ① التقاطع عند **رأس مشترك** (نقطة بداية/نهاية في العنصرين) = مفترق ⇒ مسموح.
--   ② التقاطع عند **نقطة داخلية** في أحدهما = تجاوز/تداخل ⇒ ممنوع.
--   ③ التطابق الكامل (نفس المسار) = تكرار ⇒ ممنوع إطلاقاً.
--
-- تطبيق: نستبدل app.map_overlap_check بدالة تفحص نوع التقاطع لا وجوده فقط.
--
-- التراجع: create or replace function app.map_overlap_check() ... (النسخة السابقة
--          موجودة في 20261122000000_map_planning_core.sql §⑥).
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- ① هل النقطة تساوي رأساً من رؤوس المسار؟ (تسامح ~0.5م)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_is_vertex(p_pt jsonb, p_path jsonb, p_tol_m double precision default 0.5)
returns boolean
language sql immutable set search_path = pg_catalog as $$
  select exists (
    select 1 from jsonb_array_elements(p_path) v
    where app.map_distance_m(
      (v->>0)::float8, (v->>1)::float8,
      (p_pt->>0)::float8, (p_pt->>1)::float8) <= p_tol_m
  )
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- ② نوع التقاطع: 'none' | 'junction' (عند رؤوس فقط) | 'crossing' (تجاوز)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_intersection_kind(p_a jsonb, p_b jsonb)
returns text
language plpgsql immutable set search_path = pg_catalog as $$
declare
  i int; j int;
  na int := jsonb_array_length(p_a);
  nb int := jsonb_array_length(p_b);
  a1 jsonb; a2 jsonb; b1 jsonb; b2 jsonb;
  found_crossing boolean := false;
  found_any boolean := false;
begin
  if na < 2 or nb < 2 then return 'none'; end if;

  for i in 0..na - 2 loop
    a1 := p_a->i; a2 := p_a->(i + 1);
    for j in 0..nb - 2 loop
      b1 := p_b->j; b2 := p_b->(j + 1);
      if app.map_segments_intersect(a1, a2, b1, b2) then
        found_any := true;
        -- تقاطع «عابر» = أي من طرفَي المقطع ليس رأساً في المسار الآخر
        if not (app.map_is_vertex(a1, p_b) or app.map_is_vertex(a2, p_b)
                or app.map_is_vertex(b1, p_a) or app.map_is_vertex(b2, p_a)) then
          found_crossing := true;
        end if;
      end if;
    end loop;
  end loop;

  if found_crossing then return 'crossing'; end if;
  if found_any then return 'junction'; end if;
  return 'none';
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- ③ المُشغِّل الجديد — يمنع التجاوز والتكرار، ويسمح بالمفترقات
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_overlap_check()
returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_dup record;
  v_kind text;
  v_same boolean;
begin
  -- ① الشوارع
  if tg_table_name = 'map_streets' then
    for v_dup in
      select s.id, s.code, s.name, s.path
      from public.map_streets s
      where s.zone_id = new.zone_id
        and s.id is distinct from new.id
        and s.status <> 'archived'
        and app.map_paths_intersect(new.path, s.path)
    loop
      -- التكرار الكامل: نفس المسار بترتيب معكوس أو مطابق
      v_same := (v_dup.path = new.path)
                or (v_dup.path = (select coalesce(jsonb_agg(e order by ord desc), '[]'::jsonb)
                                  from jsonb_array_elements(new.path) with ordinality as t(e, ord)));
      if v_same then
        raise exception 'MAP_DUPLICATE: الشارع مطابق تماماً لـ % (%)',
          v_dup.code, coalesce(v_dup.name, 'بلا اسم')
          using errcode = 'check_violation',
                hint = 'احذف المكرر أو أرشِفه';
      end if;

      v_kind := app.map_intersection_kind(new.path, v_dup.path);
      if v_kind = 'crossing' then
        raise exception 'MAP_CROSSING: الشارع يتجاوز % (%) في نقطة داخلية لا مفترق',
          v_dup.code, coalesce(v_dup.name, 'بلا اسم')
          using errcode = 'check_violation',
                hint = 'الشوارع تتقاطع عند المفترقات (رؤوس مشتركة) فقط';
      end if;
      -- v_kind = 'junction' ⇒ مسموح: هذا مفترق طبيعي
    end loop;
  end if;

  -- ② الأزقة: أشد صرامة — الزقاق لا يتقاطع مع زقاق آخر إطلاقاً (حتى عند رأس)
  if tg_table_name = 'map_alleys' then
    for v_dup in
      select a.id, a.code, a.name, a.path
      from public.map_alleys a
      where a.zone_id = new.zone_id
        and a.id is distinct from new.id
        and a.status <> 'archived'
        and app.map_paths_intersect(new.path, a.path)
    loop
      raise exception 'MAP_OVERLAP: الزقاق يتقاطع مع % (%) في نفس الزون',
        v_dup.code, coalesce(v_dup.name, 'بلا اسم')
        using errcode = 'check_violation',
              hint = 'الزقاق يصل إلى شارع، ولا يخترق زقاقاً آخر';
    end loop;
  end if;

  return new;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- ④ صلاحيات الدالتين الجديدتين
-- ───────────────────────────────────────────────────────────────────────────
revoke all on function app.map_is_vertex(jsonb, jsonb, float8) from public, anon;
revoke all on function app.map_intersection_kind(jsonb, jsonb) from public, anon;
grant execute on function app.map_is_vertex(jsonb, jsonb, float8) to authenticated;
grant execute on function app.map_intersection_kind(jsonb, jsonb) to authenticated;
