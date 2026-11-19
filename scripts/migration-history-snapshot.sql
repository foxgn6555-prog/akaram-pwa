-- لقطة قراءة-فقط لسجل ترحيلات الإنتاج — تُستخدم لتحديث docs/migration-history.json
--
-- شغّلها على قاعدة الإنتاج (قراءة فقط، لا كتابة):
--   select json_agg(version order by version) from supabase_migrations.schema_migrations;
--
-- ثم ضع الناتج في الحقل versions في docs/migration-history.json وحدّث captured_at/total،
-- ثم نفّذ:  npm run check:migrations
--
-- تحذير: لا تُشغّل `supabase db push` على الإنتاج. بعض ملفات الترحيل ليست آمنة التكرار
-- (مثال: 20261117160000_permission_catalog_disbursements يحذف permission_write_bindings بالكامل).
select version, name
  from supabase_migrations.schema_migrations
 order by version;
