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

/** الدوال الطرفية المنشورة في المشروع (supabase/functions) — تُفحص بالوصول فقط؛ أي ردّ HTTP (حتى 401/405) = الدالة منشورة وتعمل */
export const EDGE_FUNCTIONS: readonly { name: string; what: string; public: boolean }[] = [
  { name: 'adms-receiver', what: 'استقبال دفع أجهزة ZKTeco', public: true },
  { name: 'biometric-bridge', what: 'استقبال وكيل الشبكة الداخلية', public: true },
  { name: 'biometric-pull', what: 'السحب من API المزود / مصدر عام', public: false },
  { name: 'gps-receiver', what: 'استقبال GPS', public: true },
  { name: 'lvn-gps-sync', what: 'مزامنة LVN', public: false },
  { name: 'notification-push-dispatch', what: 'إرسال الإشعارات', public: false },
  { name: 'mailgun-send', what: 'إرسال البريد', public: false },
  { name: 'admin-users', what: 'إدارة الحسابات', public: false },
  { name: 'complaint-generate-report', what: 'تقارير الشكاوى', public: false },
]
export type EdgeHealth = { name: string; what: string; state: 'up' | 'down' | 'unknown'; http: number | null; latency_ms: number | null }

export const devops = {
  async status(): Promise<DevOpsSnapshot> {
    const t = performance.now()
    const status = (await sdkGuard(supabase.rpc('devops_status'))) as DevOpsStatus
    return { status, latency_ms: Math.round(performance.now() - t) }
  },
  /** يفحص كل دالة بطلب OPTIONS (لا ينفّذ منطقها ولا يحتاج مفتاحاً). down = لا ردّ إطلاقاً (غير منشورة/انقطاع). */
  async edgeHealth(fetchFn: typeof fetch = fetch): Promise<EdgeHealth[]> {
    const base = supabaseConfig.url.replace(/\/$/, '')
    return Promise.all(EDGE_FUNCTIONS.map(async (f) => {
      const t = performance.now()
      try {
        const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 8000)
        const r = await fetchFn(`${base}/functions/v1/${f.name}`, { method: 'OPTIONS', signal: ctrl.signal })
        clearTimeout(timer)
        // 404 من البوابة = الدالة غير منشورة
        return { name: f.name, what: f.what, state: r.status === 404 ? 'down' : 'up', http: r.status, latency_ms: Math.round(performance.now() - t) } as EdgeHealth
      } catch {
        return { name: f.name, what: f.what, state: 'down', http: null, latency_ms: null }
      }
    }))
  },
}
