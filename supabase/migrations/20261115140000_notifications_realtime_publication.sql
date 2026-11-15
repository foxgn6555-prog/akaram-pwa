-- إشعارات الحساب الحالي تصل لحظياً عبر Realtime.
-- السبب: جدول public.notifications لم يكن ضمن منشور supabase_realtime، فكان الاشتراك ينجح شكلياً ولا تصل أحداث INSERT/UPDATE.
-- تعديل عرضي فقط: لا يغيّر قواعد الإشعارات ولا الصلاحيات؛ يضيف الجدول إلى المنشور فقط إن لم يكن موجوداً.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'notifications'
     ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end $$;
