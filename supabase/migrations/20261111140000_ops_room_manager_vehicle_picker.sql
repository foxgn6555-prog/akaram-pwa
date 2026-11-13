-- 20261111140000_ops_room_manager_vehicle_picker.sql
--
-- 00403 · مكمّل لترحيل 00400 (بوابة مدير غرفة العمليات).
-- السبب: صفحة تقارير الوقود تتيح «تقرير آلية واحدة / آليات محددة»، وقائمة اختيار الآليات
--        تأتي من public.garage_search_vehicles — وكانت محجوبة عن الدور الجديد (GARAGE_FORBIDDEN)
--        فيظهر التقرير الشامل لكن يتعذر اختيار آلية.
--
-- ما يتغيّر: إضافة الدور إلى قائمة القراءة في دالة بحث واحدة (قراءة فقط: لا إدراج/تعديل/حذف).
-- ما لا يتغيّر: نطاق الرؤية وسياسات RLS وبوابة الكتابة app.require_garage_actor.

do $do$
declare def text; new_def text;
begin
  def := pg_get_functiondef('public.garage_search_vehicles(text,smallint,text,integer,integer,boolean)'::regprocedure);
  new_def := replace(
    def,
    '''central_garage_officer'',''ops_room'',''super_admin''',
    '''central_garage_officer'',''ops_room'',''ops_room_manager'',''super_admin'''
  );
  if new_def = def then
    raise exception '00403: لم يُعثر على قائمة الأدوار في garage_search_vehicles';
  end if;
  execute new_def;
end $do$;
