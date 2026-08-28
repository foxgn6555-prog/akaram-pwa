#!/usr/bin/env bash
# ═══ تطبيق المهاجرات على المشروع البعيد مباشرة (npx supabase db push) ═══
# الاستخدام:
#   npm run db:push                 → تطبيق فعلي
#   npm run db:push -- --dry-run    → معاينة ما سيُطبَّق دون تغيير
# المتطلبات (إحدى طريقتين للمصادقة):
#   أ) npx supabase login          ← مرة واحدة، يفتح المتصفح (الأسهل محلياً)
#   ب) SUPABASE_ACCESS_TOKEN في .env.local
# + SUPABASE_PROJECT_REF و SUPABASE_DB_PASSWORD في .env.local
set -euo pipefail
cd "$(dirname "$0")/.."

# تحميل متغيرات البيئة المحلية
if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

: "${SUPABASE_PROJECT_REF:?ضع SUPABASE_PROJECT_REF في .env.local — من رابط المشروع}"
export SUPABASE_DB_PASSWORD="${SUPABASE_DB_PASSWORD:-}"

# المصادقة: env token إن وُجد، وإلا تسجيل دخول متصفح تفاعلي
if [ -n "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "① المصادقة: SUPABASE_ACCESS_TOKEN من .env.local"
else
  echo "① المصادقة: تسجيل دخول المتصفح…"
  if ! npx supabase projects list >/dev/null 2>&1; then
    echo "   لم أجد جلسة دخول — شغّل: npx supabase login"
    npx supabase login
  fi
fi

echo "② ربط المشروع البعيد: $SUPABASE_PROJECT_REF"
npx supabase link --project-ref "$SUPABASE_PROJECT_REF"

echo "③ المهاجرات المعلقة:"
npx supabase migration list || true

echo "④ التطبيق: npx supabase db push $*"
npx supabase db push "$@"

echo ""
echo "✅ تم — تحقق من Dashboard → Database → Migrations"
echo "   وبعد أول تطبيق فعّل الـ hook: Dashboard → Auth → Hooks → custom_access_token_hook"
