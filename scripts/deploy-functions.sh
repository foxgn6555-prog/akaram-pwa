#!/usr/bin/env bash
# نشر كل Edge Functions للمشروع البعيد
set -euo pipefail
cd "$(dirname "$0")/.."
echo "① adms-receiver (بلا تحقق JWT — الجهاز يتصل بSN فقط)"
npx supabase functions deploy adms-receiver --no-verify-jwt
echo "② gps-receiver (بلا تحقق JWT — المزود بAPI key)"
npx supabase functions deploy gps-receiver --no-verify-jwt
echo ""
echo "✅ النشر اكتمل — راقب: Dashboard → Edge Functions"
echo "   سجلات المكالمات: supabase functions logs adms-receiver"
