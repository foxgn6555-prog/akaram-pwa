# اختبار الميجريشنات على قاعدة فارغة (PostgreSQL حقيقية)

يتحقق هذا المجلد أن كل ملفات `supabase/migrations/*.sql` تُطبَّق على قاعدة فارغة
دون أخطاء، وأن عزل بيانات مسؤولي الأقسام (RLS) يعمل فعلياً بين مديرين حقيقيين.

## المتطلبات
PostgreSQL محلي (مثلاً `sudo apt-get install -y postgresql`). لا حاجة لـ Docker أو Supabase CLI.

## التشغيل

```bash
# 1) إنشاء قاعدة فارغة + أدوار Supabase
sudo -u postgres psql -c "drop database if exists akram_mig_test;"
sudo -u postgres psql -c "create database akram_mig_test;"
sudo -u postgres psql -c "create role anon nologin; create role authenticated nologin; create role service_role nologin;" 2>/dev/null || true

# 2) محاكاة بيئة Supabase (auth / storage / أدوار إدارية + منح افتراضية)
sudo -u postgres psql -d akram_mig_test -v ON_ERROR_STOP=1 -f tests/db/supabase-mock.sql

# 3) تطبيق كل الميجريشنات بالترتيب (يتوقف عند أول خطأ)
for f in $(ls supabase/migrations/*.sql | sort); do
  echo "$f"
  sudo -u postgres psql -d akram_mig_test -v ON_ERROR_STOP=1 -q -f "$f" || break
done

# 4) اختبار العزل الوظيفي (مديران بقواطع مختلفة + معاون)
sudo -u postgres psql -d akram_mig_test -v ON_ERROR_STOP=1 -f tests/db/rls-functional-test.sql
```

## ما الذي يغطيه `rls-functional-test.sql` (16 فحصاً)
- مدير القاطع 1 يرى عمال/آليات قاطعه فقط (لا يرى شيئاً لمدير القاطع 2).
- دوال العزل `app.current_manager_sectors / manager_manages_sector / manager_owns_sectors`.
- منع إضافة عامل/آلية لقاطع خارجي عبر RPC ومنع الإدخال المباشر لجدول (RLS).
- كتاب المستلزمات يثبّت الهوية من الخادم (اسم من employees + القواطع من الملف)، ورقم متسلسل.
- رفض كتاب بلا توقيع إلكتروني (signed).
- منع تسجيل حضور عامل قاطع خارجي، ونجاح تسجيل حضور عامله.
- المعاون يرى كل الكتب الواردة؛ كل مدير لا يرى كتب غيره.
- تسجيل الصور وبلاغات الأعطال يحملان هوية/قواطع المُرسِل الصحيحة.

## ملاحظة
هذا اختبار PostgreSQL خام للتأكد من صحة SQL والـ RLS. أداء وسياسات الـ Storage
الحقيقية تُختبر على Supabase نفسها، لكن المنطق مطابق (`storage.foldername` بنفس السلوك).
