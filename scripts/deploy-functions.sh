#!/usr/bin/env bash
# نشر كل Edge Functions للمشروع البعيد
set -euo pipefail
cd "$(dirname "$0")/.."
echo "① adms-receiver (بلا تحقق JWT — الجهاز يتصل بSN فقط)"
npx supabase functions deploy adms-receiver --no-verify-jwt
echo "② gps-receiver (بلا تحقق JWT — المزود بAPI key)"
npx supabase functions deploy gps-receiver --no-verify-jwt
echo "③ Mailgun inbound (توقيع HMAC بدلاً من JWT)"
npx supabase functions deploy mailgun-inbound --no-verify-jwt
echo "④ Mailgun delivery events (توقيع HMAC بدلاً من JWT)"
npx supabase functions deploy mailgun-events --no-verify-jwt
echo "⑤ Mailgun send (JWT مستخدم التطبيق إلزامي)"
npx supabase functions deploy mailgun-send
echo "⑥ مولد تقارير PowerPoint (JWT إلزامي)"
npx supabase functions deploy complaint-generate-report
echo ""
echo "✅ النشر اكتمل — راقب: Dashboard → Edge Functions"
echo "   سجلات المكالمات: supabase functions logs adms-receiver"
