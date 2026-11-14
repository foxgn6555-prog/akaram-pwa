-- 00408 — حدود القواطع على الخريطة: السماح للمدير المفوض والمعاون بالقراءة
--
-- العيب (مكتشَف بالفحص الحيّ ④-58): صفحة «بقع التوقف» في بوابة المدير المفوض
-- (/executive/stop-hotspots) وبوابة المعاون (/deputy/stop-hotspots) تستدعي
-- gps_lvn_map_geofences لرسم حدود القواطع، والدالة ترفضهما:
--     if auth.uid() is null or not app.has_role(array['ops_room','it_admin','super_admin'])
--     then raise exception 'GPS_FORBIDDEN'; end if;
-- ⇒ استجابة 400 لكل طلب، وطبقة الحدود لا تُرسم، ورسالة «تعذر تحميل حدود القواطع».
--
-- القرار (المستخدم، الجولة 36): إصلاح مسموح — الخيار (أ): إضافة الدورين إلى حارس
-- دالة القراءة هذه وحدها.
--
-- حدود التغيير (نarrowest possible):
--   · دالة واحدة: gps_lvn_map_geofences
--   · سطر واحد: قائمة الأدوار فقط — لا تغيير في المخرجات ولا الاستعلام ولا النطاق
--   · قراءة فقط (STABLE · لا إدراج/تعديل/حذف) · نفس نوع الجيوكود نفس الشكل
--   · لا يمسّ أي دالة كتابة، ولا RLS، ولا نطاق رؤية أي دور آخر
--
-- الأثر: المدير المفوض والمعاون يريان حدود القواطع على الخريطة كما يراها غرفة العمليات.
-- من لا يملك أيًّا من الأدوار الخمسة يبقى مرفوضًا بـGPS_FORBIDDEN كما كان.

create or replace function public.gps_lvn_map_geofences()
returns table(id uuid, name text, source text, color text, polygon jsonb, sector_id smallint, area_name text, parent_sector text)
language plpgsql stable security definer set search_path=public,app as $$
begin
  if auth.uid() is null
     or not app.has_role(array['ops_room','it_admin','super_admin','executive_director','deputy_director'])
  then raise exception 'GPS_FORBIDDEN'; end if;
  return query
    select g.id, g.name, g.source, g.color, g.polygon, g.sector_id, s.name, s.parent_sector
    from public.gps_geofences g
    left join public.sectors s on s.id = g.sector_id
    where g.is_active
    order by g.name;
end$$;

-- تحقّق فوري: يجب أن يحتوي التعريف على الأدوار الخمسة
do $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'gps_lvn_map_geofences';
  if d is null or position('executive_director' in d) = 0 or position('deputy_director' in d) = 0 then
    raise exception '00408 verification failed: roles not applied';
  end if;
end$$;
