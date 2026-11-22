-- ═══════════════════════════════════════════════════════════════════════════
-- اختبار المرحلة ① — سكربت Overpass v2 والأرباع
--
--   يشغّله CI عبر scripts/db-tests.sh (محصّن: begin/rollback ⇒ لا أثر).
--
--   يعتمد على ما أثبته التنفيذ على PostgreSQL 17 محلياً:
--     · الأرباع الأربعة تُغطّي نطاق الزون بدقة، ومجموع مساحاتها = مساحة النطاق
--       (لا ثغرة ولا تراكب)
--     · السكربت يحتوي maxsize 2ج.ب و out meta
--     · الحرّاس يرفضون ربعاً خارج 1..4 وزوناً غير موجود
--     · عيب `NULL || 'نص' = NULL` لا يعود: poly لا يكون فارغاً أبداً
-- ═══════════════════════════════════════════════════════════════════════════
begin;

do $$
declare
  v_geofence uuid := gen_random_uuid();
  v_zone     uuid := gen_random_uuid();
  v_script   text;
  v_poly     text;
  v_nums     numeric[];
  v_ok       boolean;
begin
  -- ── بيانات اختبار: مضلّع مستطيل بسيط 0.02° × 0.02° ──
  -- ⚠ name و source مطلوبان (not null) في الجدول الحقيقي 00093 — بنيتي
  --   المصغّرة محلياً لم تكن تحمل هذه القيود فكنت أختبر ضدّ جدول أسهل.
  insert into public.gps_geofences (id, name, source, polygon, sector_id)
  values (v_geofence, 'زون اختبار', 'platform',
          '[[33.30,44.30],[33.30,44.32],[33.32,44.32],[33.32,44.30]]'::jsonb, 1);

  insert into public.map_zones (id, code, name, geofence_id)
  values (v_zone, 'TSA', 'زون اختبار', v_geofence);  -- code ~ '^[A-Z]{3}$' (قيد 20261122000000 سطر ١٨١)

  -- ── ① السكربت الأساسي ──
  v_script := app.map_osm_script_v2(v_zone);

  if position('maxsize:2147483648' in v_script) = 0 then
    raise exception 'فشل ①: maxsize ليس 2ج.ب';
  end if;
  if position('1073741824' in substring(v_script from '[out:xml]')) > 0 then
    raise exception 'فشل ①: maxsize القديم (1ج.ب) ما زال في الاستعلام';
  end if;
  if position('out meta;' in v_script) = 0 then
    raise exception 'فشل ①: out meta مفقود';
  end if;
  if position('out body;' in substring(v_script from '[out:xml]')) > 0 then
    raise exception 'فشل ①: out body ما زال في الاستعلام';
  end if;
  if position('poly:""' in v_script) > 0 then
    raise exception 'فشل ①: poly فارغ — عيب NULL || نص عاد';
  end if;
  if position('الرياض' in v_script) > 0 then
    raise exception 'فشل ①: اسم الزون يجب أن يكون «زون اختبار» لا «الرياض»';
  end if;
  if position('زون اختبار' in v_script) = 0 then
    raise exception 'فشل ①: اسم الزون غير مذكور في التعليق';
  end if;

  -- ── ② الأرباع: التغطية والمساحة ──
  declare
    /* جدول مؤقت بدل مصفوفة متداخلة: unnest(numeric[][]) يفكّ كل الأبعاد
       ⇒ b[1] يصبح numeric لا مصفوفة، و`cannot subscript type numeric`. */
    v_lat0 numeric; v_lat1 numeric; v_lng0 numeric; v_lng1 numeric;
    v_area numeric := 0;
    v_total numeric;
    q int;
    v_q_lat0 numeric; v_q_lat1 numeric; v_q_lng0 numeric; v_q_lng1 numeric;
  begin
    create temporary table if not exists _qbox (
      q int primary key, lat0 numeric, lat1 numeric, lng0 numeric, lng1 numeric
    ) on commit drop;

    for q in 1..4 loop
      v_script := app.map_osm_script_quarter(v_zone, q);
      if position('poly:""' in v_script) > 0 then
        raise exception 'فشل ②: ربع % بلا مضلّع', q;
      end if;

      -- نستخرج الأرقام من poly:"..." — أزواج (lat lng lat lng …)
      v_poly := substring(v_script from 'poly:"([^"]*)"');
      v_nums := string_to_array(v_poly, ' ')::numeric[];

      -- ⚠ لا شرائح بخطوة في PL/pgSQL (v[1:n:2] غير مدعومة)
      --   نستخرج الزوجي/الفردي بـgenerate_subscripts
      select min(v_nums[i]), max(v_nums[i]) into v_q_lat0, v_q_lat1
        from generate_subscripts(v_nums,1) i where i % 2 = 1;
      select min(v_nums[i]), max(v_nums[i]) into v_q_lng0, v_q_lng1
        from generate_subscripts(v_nums,1) i where i % 2 = 0;

      insert into _qbox (q, lat0, lat1, lng0, lng1)
      values (q, v_q_lat0, v_q_lat1, v_q_lng0, v_q_lng1);
    end loop;

    -- الاتحاد يغطي الزون تماماً
    select min(lat0), max(lat1), min(lng0), max(lng1)
      into v_lat0, v_lat1, v_lng0, v_lng1 from _qbox;

    if abs(v_lat0 - 33.30) > 1e-6 or abs(v_lat1 - 33.32) > 1e-6
       or abs(v_lng0 - 44.30) > 1e-6 or abs(v_lng1 - 44.32) > 1e-6 then
      raise exception 'فشل ②: الأرباع لا تغطي الزون — lat %–% lng %–%',
        v_lat0, v_lat1, v_lng0, v_lng1;
    end if;

    -- مجموع المساحات = مساحة النطاق (بلا ثغرة ولا تراكب)
    select sum((lat1-lat0) * (lng1-lng0)) into v_area from _qbox;
    v_total := (v_lat1-v_lat0) * (v_lng1-v_lng0);
    if abs(v_area / v_total - 1) > 1e-9 then
      raise exception 'فشل ②: الأرباع متراكبة أو ناقصة (نسبة المساحة %)', v_area/v_total;
    end if;
  end;

  -- ── ③ الحرّاس ──
  v_ok := false;
  begin
    perform app.map_osm_script_quarter(v_zone, 0);
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'فشل ③: ربع 0 لم يُرفض'; end if;

  v_ok := false;
  begin
    perform app.map_osm_script_quarter(v_zone, 5);
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'فشل ③: ربع 5 لم يُرفض'; end if;

  v_ok := false;
  begin
    perform app.map_osm_script_v2(gen_random_uuid());
  exception when no_data_found then v_ok := true;
  end;
  if not v_ok then raise exception 'فشل ③: زون غير موجود لم يُرفض'; end if;

  -- ── ④ الدالة القديمة ما زالت تعمل (لا كسر للتراجع) ──
  v_script := app.map_osm_script(v_zone);
  if position('poly:' in v_script) = 0 then
    raise exception 'فشل ④: map_osm_script القديمة تعطّلت';
  end if;

  raise notice '✓ كل اختبارات المرحلة ① نجحت';
end $$;

rollback;
