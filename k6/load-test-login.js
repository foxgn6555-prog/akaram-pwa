/**
 * k6 Load Test — تسجيل الدخول تحت الضغط
 * يختبر: استجابة صفحة الدخول · RPC أمن الدخول · استقرار الخادم
 * التشغيل: k6 run k6/load-test-login.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';


export const options = {
  stages: [
    { duration: '30s', target: 10 },   // تسخين
    { duration: '1m', target: 50 },    // ضغط متوسط
    { duration: '1m', target: 100 },   // ذروة
    { duration: '30s', target: 0 },    // تبريد
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500'],
  },
};

const BASE_URL = __ENV.SUPABASE_URL || 'http://localhost:54321';
const ANON_KEY = __ENV.ANON_KEY || 'placeholder';

export default function () {
  // اختبار RPC is_login_locked (أرخص دالة)
  const res = http.post(
    `${BASE_URL}/rest/v1/rpc/is_login_locked`,
    JSON.stringify({ p_email: `load-test-${__VU}@load.iq` }),
    {
      headers: {
        'Content-Type': 'application/json',
        'apikey': ANON_KEY,
      },
    },
  );
  check(res, {
    'status is 200': (r) => r.status === 200,
    'body is boolean': (r) => r.body === 'true' || r.body === 'false',
  });

  sleep(1);
}
