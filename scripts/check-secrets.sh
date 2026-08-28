#!/usr/bin/env bash
# ═══ فاحص تسريب الأسرار — يعمل: محلياً (pre-commit) + في CI ═══
# يفحص الملفات المتتبعة/المرحّلة عن أنماط مفاتيح Supabase و JWT.
# الأنماط تُبنى بالتسلسل كي لا يطابق السكربت نفسه.
set -euo pipefail
cd "$(dirname "$0")/.."

SECRET_PAT="sb_""secret_[A-Za-z0-9_-]{16,}"
PUB_PAT="sb_""publishable_[A-Za-z0-9_-]{16,}"
JWT_PAT="eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}"
ACCESS_PAT="sbp_[A-Za-z0-9]{30,}"

# الملفات المفحوصة: متتبعة في git + المرحّلة؛ وإن لم يوجد git → الكل ما عدا المستثنى
if git rev-parse --git-dir >/dev/null 2>&1; then
  FILES=$( { git ls-files; git diff --cached --name-only; } | sort -u )
else
  FILES=$(find . -type f \
    -not -path './node_modules/*' -not -path './dist/*' -not -path './.git/*' \
    -not -path './coverage/*' -not -name '.env.local' | sed 's|^\./||')
fi

LEAKS=0
while IFS= read -r file; do
  [ -f "$file" ] || continue
  # استثناء سكربت الفحص نفسه وملف المثال
  case "$file" in
    scripts/check-secrets.sh|.env.example) continue ;;
  esac
  if grep -nEH "$SECRET_PAT|$PUB_PAT|$JWT_PAT|$ACCESS_PAT" "$file" 2>/dev/null; then
    echo "❌ تسريب مفاتيح في: $file (احذفها واستخدم .env.local)"
    LEAKS=1
  fi
done <<< "$FILES"

if [ "$LEAKS" -eq 0 ]; then
  echo "✅ لا أسرار في الملفات المتتبعة"
else
  echo ""
  echo "═══ إجراء الإصلاح ═══"
  echo "1) انقل المفتاح إلى .env.local (مستثنى من git)"
  echo "2) دوّر المفتاح المكشوف: Dashboard → API Keys → Rotate"
  exit 1
fi
