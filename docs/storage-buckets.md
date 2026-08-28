# Buckets وسياساتها (00015_storage_buckets.sql)

| Bucket | عام؟ | الحد | الأنواع | القراءة | الكتابة |
|--------|:----:|------|---------|---------|---------|
| `employee-documents` | لا | 10MB | pdf/png/jpeg/webp | المالك (مجلده) + HR | المالك + HR |
| `payroll` | لا | 5MB | pdf | المالك + HR + Finance | HR + Finance |
| `avatars` | نعم | 2MB | png/jpeg/webp | الجميع | المالك فقط (مجلده) |

**اتفاقية المسارات:** `{bucket}/{employee_id}/{timestamp}-{slug}.{ext}` — تعتمد عليها
سياسات Storage (`storage.foldername(name)[1]`). لا تخترقها أبداً.
التحقق مزدوج: `validateFile()` في العميل + سياسات الخادم (الحاكم).
