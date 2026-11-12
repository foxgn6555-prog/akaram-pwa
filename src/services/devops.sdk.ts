/** 00278 — لوحة الحالة الحية (دليل التشغيل التقني): قراءة فقط — RPC devops_status + فحص وصول الدوال الطرفية من المتصفح */
import { sdkGuard, supabase } from './client'
import { supabaseConfig } from '@config/supabase.config'

export interface DevOpsDevice {
  id: string; name: string; serial: string; mode: string; is_active: boolean
  last_seen_at: string | null; bridge_last_error: string | null
  last_punch_at: string | null; punches_today: number
  last_pull: { status: 'success' | 'partial' | 'failed'; started_at: string; inserted: number; received: number; error: string | null } | null
  queued_commands: number
}
export interface DevOpsStatus {
  generated_at: string
  database: { now: string; version: string; migrations_tracked: boolean; migrations_count: number | null; last_migration: string | null; last_migration_at: string | null; functions_count: number; tables_count: number; rls_disabled_tables: string[] }
  biometric: { devices: DevOpsDevice[]; punches_today: number; unmatched_today: number; last_punch_at: string | null; failed_pulls_24h: number }
  gps: { last_fix_at: string | null; vehicles_10m: number }
  auth: { users_total: number; signins_24h: number | null }
}
export interface DevOpsSnapshot { status: DevOpsStatus; latency_ms: number }

/**
 * كل دالة طرفية موجودة في المستودع (supabase/functions) — تُفحص بالوصول فقط؛
 * أي ردّ HTTP (حتى 401/405) = الدالة منشورة وتعمل. V-23: القائمة كانت ٩ فقط فتخفي
 * دوالاً منشورة وتُظهر أخرى غير منشورة؛ صارت مطابقة للمستودع (١٤).
 */
export const EDGE_FUNCTIONS: readonly { name: string; what: string; public: boolean; unused?: boolean }[] = [
  { name: 'adms-receiver', what: 'استقبال دفع أجهزة ZKTeco', public: true },
  { name: 'biometric-bridge', what: 'استقبال وكيل الشبكة الداخلية', public: true },
  { name: 'biometric-pull', what: 'السحب من API المزود / مصدر عام', public: false },
  { name: 'gps-receiver', what: 'استقبال GPS', public: true, unused: true },
  { name: 'gps-warehouse', what: 'مستودع قراءات GPS', public: false },
  { name: 'lvn-gps-sync', what: 'مزامنة LVN', public: false },
  { name: 'notification-push-dispatch', what: 'إرسال الإشعارات', public: false },
  { name: 'mailgun-send', what: 'إرسال البريد', public: false },
  { name: 'mailgun-inbound', what: 'استقبال بريد الوارد', public: true },
  { name: 'mailgun-events', what: 'أحداث تسليم البريد', public: true },
  { name: 'admin-users', what: 'إدارة الحسابات', public: false },
  { name: 'staff-login', what: 'دخول الموظفين (قفل المصدر)', public: true },
  { name: 'login-support', what: 'محادثة دعم الدخول', public: true },
  { name: 'complaint-generate-report', what: 'تقارير الشكاوى', public: false },
  { name: 'complaint-permanent-delete', what: 'الحذف النهائي للشكوى', public: false },
  { name: 'webhooks', what: 'نقطة استقبال Webhooks (HMAC)', public: true, unused: true },
]
export type EdgeHealth = { name: string; what: string; state: 'up' | 'down' | 'unknown'; http: number | null; latency_ms: number | null }

export const devops = {
  async status(): Promise<DevOpsSnapshot> {
    const t = performance.now()
    const status = (await sdkGuard(supabase.rpc('devops_status'))) as DevOpsStatus
    return { status, latency_ms: Math.round(performance.now() - t) }
  },
  /**
   * فحص صحة دوال الحافة — V-23.
   * ملاحظة مهمة: OPTIONS ليست طريقة «بسيطة» في CORS، فالمتصفح يُرسل preflight قبلها؛
   * لذلك أي ردّ لا يمرّ بمعالجة CORS (مثل 404 من البوابة) يُحجب ويظهر كفشل شبكة —
   * وهذا سبب الإنذار الكاذب القديم. الترتيب الآن:
   *   1) OPTIONS: يعمل فقط للدوال المنشورة التي تعالج CORS ⇒ up (ويُقرأ رمز الحالة).
   *   2) إن فشل: GET عادي (طريقة بسيطة بلا preflight) ⇒ نقرأ الحالة الحقيقية:
   *      404 = غير منشورة ⇒ down، وأي رمز آخر ⇒ up.
   *   3) إن فشل الاثنان: GET بـno-cors ⇒ إن وصل الخادم فعلاً ⇒ unknown (لا ادّعاء).
   *   4) غير ذلك ⇒ down (لا ردّ إطلاقاً).
   * لا تُرسل أي مصادقة ولا يُنفَّذ منطق الدوال: بوابة Supabase تردّ 401 على الدوال
   * المحمية، والدوال العامة تردّ 405 لطلبات GET.
   */
  async edgeHealth(fetchFn: typeof fetch = fetch): Promise<EdgeHealth[]> {
    const base = supabaseConfig.url.replace(/\/$/, '')
    const probe = async (url: string, init: RequestInit): Promise<Response | null> => {
      const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 8000)
      try { return await fetchFn(url, { ...init, signal: ctrl.signal }) } catch { return null } finally { clearTimeout(timer) }
    }
    return Promise.all(EDGE_FUNCTIONS.map(async (f) => {
      const url = `${base}/functions/v1/${f.name}`
      const t0 = performance.now()
      const ms = () => Math.round(performance.now() - t0)
      const options = await probe(url, { method: 'OPTIONS' })
      if (options) return { name: f.name, what: f.what, state: options.status === 404 ? 'down' : 'up', http: options.status, latency_ms: ms() } as EdgeHealth
      const get = await probe(url, { method: 'GET', cache: 'no-store' })
      if (get) return { name: f.name, what: f.what, state: get.status === 404 ? 'down' : 'up', http: get.status, latency_ms: ms() } as EdgeHealth
      const opaque = await probe(url, { method: 'GET', mode: 'no-cors', cache: 'no-store' })
      return { name: f.name, what: f.what, state: opaque ? 'unknown' : 'down', http: null, latency_ms: opaque ? ms() : null } as EdgeHealth
    }))
  },
}
