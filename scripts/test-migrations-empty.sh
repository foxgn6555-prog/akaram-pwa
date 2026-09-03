#!/usr/bin/env bash
# ═══ اختبار المهاجرات على قاعدة فارغة — محلياً وفي CI قبل كل merge ═══
# المتطلب: Docker + Supabase CLI
set -euo pipefail
cd "$(dirname "$0")/.."

echo "① إيقاف أي بيئة سابقة (قاعدة نظيفة 100%)"
supabase stop --no-backup 2>/dev/null || true

echo "② تشغيل البيئة المحلية"
supabase start

echo "③ reset: قاعدة فارغة ← تطبيق كل المهاجرات بالترتيب"
supabase db reset

CONNECTION="postgresql://postgres:postgres@localhost:54322/postgres"

echo "④ اختبار الدخان على المخطط الناتج"
psql "$CONNECTION" -v ON_ERROR_STOP=1 -f supabase/tests/smoke_schema.sql

echo "⑤ اختبار عزل دور بوابة الشكاوى ودورة الإسناد"
psql "$CONNECTION" -v ON_ERROR_STOP=1 -f supabase/tests/rls_policies.test.sql
psql "$CONNECTION" -v ON_ERROR_STOP=1 -f supabase/tests/triggers.test.sql
psql "$CONNECTION" -v ON_ERROR_STOP=1 -f supabase/tests/complaints_isolation.sql
psql "$CONNECTION" -v ON_ERROR_STOP=1 -f supabase/tests/complaints_workflow_isolation.sql
psql "$CONNECTION" -v ON_ERROR_STOP=1 -f supabase/tests/complaints_end_to_end.sql

echo "⑥ تحقق صلاحية anon على فحص القفل"
psql "$CONNECTION" -tAc "select has_function_privilege('anon', 'app.is_login_locked(text)', 'execute');" | grep -q t \
  && echo "  ✅ anon يستطيع فحص القفل"

echo ""
echo "═══ ✅ جميع المهاجرات تُطبَّق على قاعدة فارغة بلا أخطاء وعزل الشكاوى محكم ═══"
