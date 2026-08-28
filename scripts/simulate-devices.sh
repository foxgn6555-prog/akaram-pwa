#!/usr/bin/env bash
# ═══ محاكاة جهاز بصمة + مزود GPS — لاختبار التكاملات محلياً بعد النشر ═══
# الاستخدام:
#   bash scripts/simulate-devices.sh --url https://xxx.supabase.co --key sb_publishable_... --api-key GPS_KEY
set -euo pipefail

URL="" ANON="" GPS_KEY=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --url) URL="$2"; shift 2 ;;
    --key) ANON="$2"; shift 2 ;;
    --api-key) GPS_KEY="$2"; shift 2 ;;
    *) echo "خيار غير معروف: $1"; exit 1 ;;
  esac
  shift || true
done

if [ -z "$URL" ] || [ -z "$ANON" ]; then
  echo "الاستخدام: $0 --url <SUPABASE_URL> --key <ANON_KEY> [--api-key <GPS_KEY>]"
  exit 1
fi

echo "═══ ① محاكاة أجهزة البصمة (ADMS) ═══"
echo "· التسجيل (options=all):"
curl -s "${URL}/functions/v1/adms-receiver/iclock/cdata?SN=ZK-TEST-001&options=all&pushver=2.4.1" \
  -H "Authorization: Bearer ${ANON}"
echo ""
echo "· نبض القلب:"
curl -s "${URL}/functions/v1/adms-receiver/iclock/getrequest?SN=ZK-TEST-001" \
  -H "Authorization: Bearer ${ANON}"
echo ""
echo "· دفع حضور (موظف 2001):"
curl -s -X POST "${URL}/functions/v1/adms-receiver/iclock/cdata?SN=ZK-TEST-001&table=ATTLOG" \
  -H "Authorization: Bearer ${ANON}" \
  -H "Content-Type: text/plain" \
  --data-binary $'2001 2026-08-27 07:55:12 0 15\n2001 2026-08-27 16:10:45 1 15'
echo ""

echo ""
echo "═══ ② محاكاة مزود GPS (OsmAnd) ═══"
if [ -n "$GPS_KEY" ]; then
  curl -s "${URL}/functions/v1/gps-receiver?id=TRK-0001&lat=33.3152&lon=44.3661&speed=18.2&apikey=${GPS_KEY}"
  echo ""
else
  echo "⚠️ --api-key غير معطى — تخطي GPS"
fi

echo ""
echo "═══ ✅ المحاكاة اكتملت — تحقق من Dashboard ═══"
