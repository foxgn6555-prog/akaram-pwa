-- ربط السياجات النشطة غير المرتبطة بقاطع عند وجود تطابق وحيد بعد توحيد الكتابة العربية.
-- لا تُنشأ أو تُعدّل حدود جغرافية؛ تُستخدم الأسماء والحدود الحالية فقط.
WITH unambiguous_matches AS (
  SELECT g.id, min(s.id)::smallint AS sector_id
  FROM public.gps_geofences g
  JOIN public.sectors s
    ON translate(lower(btrim(s.name)), 'أإآٱةىـ', 'ااااهى ') =
       translate(lower(btrim(g.name)), 'أإآٱةىـ', 'ااااهى ')
  WHERE g.is_active AND g.sector_id IS NULL
  GROUP BY g.id
  HAVING count(*) = 1
)
UPDATE public.gps_geofences g
SET sector_id = m.sector_id
FROM unambiguous_matches m
WHERE g.id = m.id AND g.sector_id IS NULL;

-- احتياط للبيانات الجديدة: لا تُسند بالاسم إلا عند وجود تطابق قطاع وحيد.
CREATE OR REPLACE FUNCTION app.gps_hotspot_locate(
  p_lat double precision,
  p_lng double precision,
  OUT sector_id smallint,
  OUT sector_name text,
  OUT zone_name text
)
LANGUAGE sql STABLE SET search_path = public, app AS $$
  SELECT coalesce(g.sector_id, s.id), s.name, g.name
  FROM public.gps_geofences g
  LEFT JOIN LATERAL (
    SELECT candidate.id, candidate.name
    FROM public.sectors candidate
    WHERE candidate.id = g.sector_id
       OR (
         g.sector_id IS NULL
         AND translate(lower(btrim(candidate.name)), 'أإآٱةىـ', 'ااااهى ') =
             translate(lower(btrim(g.name)), 'أإآٱةىـ', 'ااااهى ')
         AND 1 = (
           SELECT count(*)
           FROM public.sectors matched
           WHERE translate(lower(btrim(matched.name)), 'أإآٱةىـ', 'ااااهى ') =
                 translate(lower(btrim(g.name)), 'أإآٱةىـ', 'ااااهى ')
         )
       )
    ORDER BY (candidate.id = g.sector_id) DESC, candidate.id
    LIMIT 1
  ) s ON true
  WHERE g.is_active
    AND coalesce(g.sector_id, s.id) IS NOT NULL
    AND app.gps_point_in_polygon(p_lat, p_lng, g.polygon)
  ORDER BY jsonb_array_length(g.polygon) DESC, g.id
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION app.gps_hotspot_locate(double precision, double precision) FROM public, anon, authenticated;

-- إعادة اشتقاق القاطع/الزون لكل بقع الأشهر الموجودة عبر المشغّل نفسه المستخدم عند الإدخال.
UPDATE public.gps_hotspots SET lat = lat WHERE id IS NOT NULL;
