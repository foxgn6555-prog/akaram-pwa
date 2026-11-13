-- اختبار رجعي لعلاج عدم إسناد السياج ذي sector_id الفارغ؛ كل البيانات التجريبية تُلغى في النهاية.
BEGIN;
DO $$
DECLARE
  v_sector_id smallint;
  v_sector_name text;
  v_test_zone_name text;
  v_actual_sector_id smallint;
  v_actual_sector_name text;
  v_actual_zone_name text;
BEGIN
  SELECT id, name INTO v_sector_id, v_sector_name
  FROM public.sectors
  ORDER BY id
  LIMIT 1;
  IF v_sector_id IS NULL THEN
    RAISE EXCEPTION 'GPS_HOTSPOTS_SECTOR_FALLBACK_TEST_REQUIRES_SECTOR';
  END IF;

  -- اكتب اسم السياج بصيغة مطبّعة حتى يختبر اختلاف الهمزة/التاء المربوطة.
  v_test_zone_name := translate(lower(btrim(v_sector_name)), 'أإآٱةىـ', 'ااااهى ');
  INSERT INTO public.gps_geofences(name, source, polygon, is_active, sector_id)
  VALUES (
    v_test_zone_name,
    'platform',
    jsonb_build_array(
      jsonb_build_object('lat', 79, 'lng', -171),
      jsonb_build_object('lat', 79, 'lng', -169),
      jsonb_build_object('lat', 81, 'lng', -169),
      jsonb_build_object('lat', 81, 'lng', -171)
    ),
    true,
    NULL
  );

  SELECT sector_id, sector_name, zone_name
  INTO v_actual_sector_id, v_actual_sector_name, v_actual_zone_name
  FROM app.gps_hotspot_locate(80, -170);

  IF v_actual_sector_id IS DISTINCT FROM v_sector_id
     OR v_actual_sector_name IS DISTINCT FROM v_sector_name
     OR v_actual_zone_name IS DISTINCT FROM v_test_zone_name THEN
    RAISE EXCEPTION 'GPS_HOTSPOTS_SECTOR_FALLBACK_FAILED: expected %, got % / % / %',
      v_sector_id, v_actual_sector_id, v_actual_sector_name, v_actual_zone_name;
  END IF;
END;
$$;
ROLLBACK;
