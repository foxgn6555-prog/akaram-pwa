#!/usr/bin/env bash
# ============================================================================
# مشغّل اختبارات SQL — F-04
#
# المشكلة التي يحلّها: 235 ملف اختبار SQL في المشروع، ولم يكن يعمل منها في CI
# إلا ثلاثة. السبب الحقيقي (مقيس) أن الملفات ليست كلها معزولة:
#   · «محصّن»   : يبدأ بـ `begin;` وينتهي بـ `rollback;` ⇒ آمن تماماً، لا يترك أثراً.
#   · «غير محصّن»: يكتب بيانات ثابتة (auth.users، hr_policy، دوال…) ولا ينظّف ⇒
#                  لا يصلح لمشاركة قاعدة واحدة؛ يحتاج قاعدة معزولة أو ترتيباً مقصوداً.
#
# السلوك الافتراضي: تشغيل المحصّنة فقط (حاجز للبناء)، والإبلاغ عن الباقي.
#
# الاستخدام:
#   ./scripts/db-tests.sh                    # المحصّنة فقط (افتراضي CI)
#   ./scripts/db-tests.sh --list             # تصنيف الملفات بلا قاعدة بيانات
#   ./scripts/db-tests.sh --all              # كل الملفات (يحتاج قاعدة معزولة!)
#   ./scripts/db-tests.sh --unguarded        # غير المحصّنة فقط
#   ./scripts/db-tests.sh --only complaint   # تصفية بالاسم
#
# متغيرات البيئة:
#   PGURL               رابط القاعدة (الافتراضي: Supabase المحلي)
#   DB_TESTS_ALLOW_FAIL =1 ⇒ لا يفشل البناء، يطبع التقرير فقط
# ============================================================================
set -uo pipefail

PGURL="${PGURL:-postgresql://postgres:postgres@localhost:54322/postgres}"
MODE="guarded"
ONLY=""
ALLOW_FAIL="${DB_TESTS_ALLOW_FAIL:-0}"

while [ $# -gt 0 ]; do
  case "$1" in
    --list) MODE="list" ;;
    --all) MODE="all" ;;
    --unguarded) MODE="unguarded" ;;
    --only) ONLY="${2:-}"; shift ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "خيار غير معروف: $1" >&2; exit 2 ;;
  esac
  shift
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 2

# ملفات ليست اختبارات (تُحمّل كتمهيد أو بيانات مشتركة)
is_helper() {
  case "$(basename "$1")" in
    local_supabase_prelude.sql|*helper*|*fixture*|*seed*) return 0 ;;
    *) return 1 ;;
  esac
}

# «محصّن» = معاملة تُرجَع كاملة
is_guarded() {
  grep -qiE '^[[:space:]]*begin[[:space:]]*;' "$1" && grep -qiE '^[[:space:]]*rollback[[:space:]]*;' "$1"
}

mapfile -t FILES < <(ls supabase/tests/*.sql tests/db/*.sql 2>/dev/null | sort)

G=(); U=(); H=()
for f in "${FILES[@]}"; do
  if is_helper "$f"; then H+=("$f"); elif is_guarded "$f"; then G+=("$f"); else U+=("$f"); fi
done

if [ "$MODE" = "list" ]; then
  printf 'محصّن (آمن، يُشغَّل في CI): %d\n' "${#G[@]}"
  printf '  %s\n' "${G[@]}" | sed 's|^|  |'
  printf '\nغير محصّن (يحتاج قاعدة معزولة): %d\n' "${#U[@]}"
  printf '\nتمهيد/بيانات مشتركة (يُستثنى): %d\n' "${#H[@]}"
  printf '%s\n' "${H[@]}" | sed 's|^|  |'
  exit 0
fi

SELECTED=()
case "$MODE" in
  guarded) SELECTED=("${G[@]}") ;;
  unguarded) SELECTED=("${U[@]}") ;;
  all) SELECTED=("${G[@]}" "${U[@]}") ;;
esac

if [ -n "$ONLY" ]; then
  filtered=()
  for f in "${SELECTED[@]}"; do case "$f" in *"$ONLY"*) filtered+=("$f") ;; esac; done
  SELECTED=("${filtered[@]}")
fi

if [ "${#SELECTED[@]}" -eq 0 ]; then
  echo "لا ملفات مطابقة." >&2
  exit 2
fi

command -v psql >/dev/null || { echo "psql غير موجود — شغّل داخل بيئة Supabase المحلية أو ثبّت client" >&2; exit 2; }

pass=0; fail=0; failed_list=()
echo "▶ تشغيل ${#SELECTED[@]} ملف اختبار SQL (الوضع: $MODE)"
for f in "${SELECTED[@]}"; do
  out="$(psql "$PGURL" -v ON_ERROR_STOP=1 -q -f "$f" 2>&1)"
  if [ $? -eq 0 ]; then
    pass=$((pass+1)); printf '  ✅ %s\n' "$f"
  else
    fail=$((fail+1)); failed_list+=("$f")
    printf '  ❌ %s\n' "$f"
    printf '%s\n' "$out" | tail -n 8 | sed 's/^/       /'
  fi
done

printf '\n════ النتيجة: نجح %d · فشل %d من %d ════\n' "$pass" "$fail" "$((pass+fail))"
if [ "$fail" -gt 0 ]; then
  printf 'الملفات الفاشلة:\n'; printf '  · %s\n' "${failed_list[@]}"
  if [ "$MODE" = "all" ] || [ "$MODE" = "unguarded" ]; then
    echo "تنبيه: الوضع الحالي يشمل ملفات غير معزولة — قد يعتمد الفشل على ترتيب التشغيل أو بقايا بيانات."
  fi
  [ "$ALLOW_FAIL" = "1" ] && { echo "(DB_TESTS_ALLOW_FAIL=1 ⇒ لا يُفشل البناء)"; exit 0; }
  exit 1
fi
exit 0
