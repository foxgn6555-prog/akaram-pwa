# دليل المساهمة

## سير العمل
1. فرع من `develop`: `feat/<scope>` أو `fix/<scope>` أو `docs/<scope>`.
2. Commit بـ Conventional Commits: `feat(requests): إضافة اعتماد جماعي`.
3. PR إلى `develop` — كل القوالب والفحوصات إلزامية.
4. `main` للإنتاج فقط عبر release.

## قبل فتح PR
```bash
npm run lint && npm run typecheck && npm test
```

## قواعد لا تُناقش
- لا `supabase` خارج `src/services` (الـ linter يرفض).
- لا Query Key inline.
- جدول جديد = migration مرقّم + RLS + version + فهارس + تحديث docs/database-schema.md.
- migration مدموج لا يُعدل — إصلاحه بـ migration جديد.

## نمط الكود
TypeScript صارم، Prettier للتنسيق، التعليقات بالعربية حيث تشرح *لماذا* لا *ماذا*.
