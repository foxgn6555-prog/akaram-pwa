# 🔬 وثيقة الخطة — الأرشيف الهندسي + الرئيسية الحية + التدقيق الشامل

## ① القرارات المعمارية الموثقة

### منظومة الأرشيف (Soft-Delete Pattern — أفضل ممارسة مؤسسية)
**المبدأ:** لا DELETE فعلي — كل حذف عملية أرشفة موثقة:
```sql
archived_at     timestamptz   -- متى
archived_by     uuid          -- من
archive_reason  text          -- لماذا
```
- **الجداول المشمولة (قرار الخبير):** employees · departments · branches ·
  biometric_devices · vehicles · dynamic_portals — بيانات تشغيلية تستحق الحفظ.
- **RLS الذكي:** `is_active AND archived_at IS NULL` في سياسات القراءة العادية
  + سياسة أرشيف: `archived_at IS NOT NULL` تظهر **حصرياً** لوحدة الأرشيف (IT).
- **الاستعادة:** RPC `archive_restore` — يعيد السجل ويسجل العملية في audit_logs.
- **الأخطاء:** `app_errors.resolved` موجودة — نضيف `archived` لها (الأخطاء المغلقة
  تذهب لأرشيف الأخطاء وليست محذوفة).
- **الإجراءات:** audit_logs موجود — الأرشيف يعرضه بواجهة بحث.
- **الدفعات:** biometric_pushes القديمة تُؤرشف تلقائياً (job لاحقاً أو يدوياً).

### الرسوم الحقيقية (بلا بيانات وهمية إطلاقاً)
| الرسم | المصدر الفعلي | التقنية |
|-------|---------------|---------|
| سرعة الاتصال (latency) | قياس فعلي: نداء HEAD لـ REST مع performance.now() كل 5 ثوانٍ → رسم خطي | hook مخصص useConnectionLatency |
| صحة قاعدة البيانات | db_overview (حجم/جداول/صفوف) + db_stats (scan) — كل 30 ثانية | Recharts BarChart/AreaChart |
| أداء التطبيق | Performance API: navigation + resource timing حقيقي | hook useAppPerf |
| توزيع الأدوار | users.list مجمعة | Recharts PieChart |
| التكاملات | integration_logs (نجاح/رفض لآخر 24 ساعة) | Recharts BarChart |
| حالة الاتصال | navigator.onLine + events | Badge حي |

**المكتبة:** Recharts (أحدث إصدار) — تفاعلية · tooltips · responsive.

### التدقيق الشامل (تدقيق وإصلاح بالتوازي)
مرور على كل زر في 7 وحدات: ربط الأزرار المعلقة · إكمال الأكشنات · إضافة تفاصيل ناقصة.

## ② المهاجرات الجديدة (00029-00030)
1. `00029_archive_system.sql`: أعمدة الأرشفة على 6 جداول + RLS محدث + RPCs
   (archive_restore · archived_counts) + app_errors.archived.
2. `00030_realtime_metrics.sql`: connection_samples (قياسات latency محفوظة
   لرسم تاريخي) + دالة تاريخية.

## ③ الجولات الداخلية
1. 00029 + 00030 + دخان
2. SDK/hooks الأرشيف + القياسات الحية
3. الرسوم البيانية (Recharts) في الرئيسية + وحدة الأرشيف الكاملة
4. التدقيق الشامل بالتوازي + إصلاحات
5. اختبارات + تحديث وثائق
