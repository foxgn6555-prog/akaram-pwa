/**
 * gps-warehouse — 00380: جسر المشروع الأول ↔ مستودع GPS التحليلي (المشروع الثاني).
 * الأسرار (تُضبط من لوحة Supabase ← Edge Functions ← Secrets، لا تمرّ عبر الشيفرة):
 *   GPS_WAREHOUSE_URL          = https://<ref>.supabase.co
 *   GPS_WAREHOUSE_SERVICE_KEY  = مفتاح الخدمة (sb_secret_… أو service_role) للمشروع الثاني
 * الإجراءات: ping (فحص الاتصال + الإصدار + الأعداد)، sync_registry (إرسال سجل الآليات)، enqueue_month (جدولة شهر للسحب — المحرّك في 00381).
 * المتصفح لا يعرف مفتاح المستودع أبداً؛ كل شيء يمرّ من هنا بعد التحقق من دور المستخدم.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '',
  SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  WH_URL = (Deno.env.get('GPS_WAREHOUSE_URL') ?? '').replace(/\/$/, ''),
  WH_KEY = Deno.env.get('GPS_WAREHOUSE_SERVICE_KEY') ?? ''
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })
type Action = 'ping' | 'sync_registry' | 'enqueue_month'
const READ_ROLES = ['ops_room', 'it_admin', 'super_admin'], WRITE_ROLES = ['it_admin', 'super_admin']

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
const safeError = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/sb_secret_[A-Za-z0-9_-]+/g, '[REDACTED]').replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED]').slice(0, 600)
const hostOf = (url: string) => { try { return new URL(url).host } catch { return null } }

async function actor(req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  if (token === SERVICE_ROLE) return { id: null, roles: WRITE_ROLES, scheduler: true }
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return null
  const { data: rows } = await admin.from('user_roles').select('role').eq('user_id', data.user.id)
  return { id: data.user.id, roles: (rows ?? []).map((r) => r.role as string), scheduler: false }
}

/** عميل المستودع بمفتاح الخدمة — RPC فقط */
function warehouse() {
  if (!WH_URL || !WH_KEY) throw new Error('GPS_WAREHOUSE_NOT_CONFIGURED')
  return createClient(WH_URL, WH_KEY, { auth: { persistSession: false } })
}
async function whRpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const wh = warehouse()
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const { data, error } = await wh.rpc(fn, args).abortSignal(controller.signal)
    if (error) {
      const msg = error.message ?? ''
      if (/does not exist|PGRST202/i.test(msg)) throw new Error('GPS_WAREHOUSE_SCHEMA_MISSING')
      if (/JWT|apikey|Invalid API key|401|403/i.test(msg)) throw new Error('GPS_WAREHOUSE_KEY_INVALID')
      throw new Error(`GPS_WAREHOUSE_RPC_FAILED: ${safeError(msg)}`)
    }
    return data as T
  } catch (e) {
    if ((e as Error).name === 'AbortError' || /fetch failed|ENOTFOUND|ECONN/i.test(String(e))) throw new Error('GPS_WAREHOUSE_UNREACHABLE')
    throw e
  } finally { clearTimeout(timer) }
}
const record = (kind: 'ping' | 'registry', ok: boolean, payload: unknown = {}, error?: string) =>
  admin.rpc('gps_warehouse_link_record', { p_kind: kind, p_ok: ok, p_payload: payload ?? {}, p_host: hostOf(WH_URL), p_error: error ?? null })

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors
  if (req.method !== 'POST') return response({ error: 'METHOD_NOT_ALLOWED' }, 405)
  const user = await actor(req)
  if (!user) return response({ error: 'GPS_WAREHOUSE_FORBIDDEN' }, 403)
  let body: { action?: Action; month?: string } = {}
  try { body = await req.json() } catch { /* بلا جسم ⇒ ping */ }
  const action: Action = body.action ?? 'ping'
  const allowed = action === 'ping' ? READ_ROLES : WRITE_ROLES
  if (!user.roles.some((r) => allowed.includes(r))) return response({ error: 'GPS_WAREHOUSE_FORBIDDEN' }, 403)
  try {
    if (action === 'ping') {
      const ping = await whRpc<Record<string, unknown>>('wh_ping')
      await record('ping', true, ping)
      return response({ ok: true, action, host: hostOf(WH_URL), ping })
    }
    if (action === 'sync_registry') {
      const { data: rows, error } = await admin.rpc('gps_warehouse_registry')
      if (error) throw new Error(`GPS_WAREHOUSE_REGISTRY_FAILED: ${safeError(error.message)}`)
      const result = await whRpc<Record<string, unknown>>('wh_upsert_vehicles', { p_rows: rows ?? [] })
      await record('registry', true, result)
      return response({ ok: true, action, sent: Array.isArray(rows) ? rows.length : 0, result })
    }
    if (action === 'enqueue_month') {
      if (!body.month || !/^\d{4}-\d{2}(-\d{2})?$/.test(body.month)) return response({ error: 'GPS_WAREHOUSE_MONTH_INVALID' }, 400)
      const month = body.month.length === 7 ? `${body.month}-01` : body.month
      const result = await whRpc<Record<string, unknown>>('wh_enqueue_month', { p_month: month })
      return response({ ok: true, action, result })
    }
    return response({ error: 'GPS_WAREHOUSE_ACTION_INVALID' }, 400)
  } catch (e) {
    const code = safeError(e)
    const kind = action === 'sync_registry' ? 'registry' : 'ping'
    if (code !== 'GPS_WAREHOUSE_NOT_CONFIGURED') await record(kind, false, {}, code.split(':')[0])
    const status = code === 'GPS_WAREHOUSE_NOT_CONFIGURED' ? 412 : 502
    return response({ ok: false, error: code }, status)
  }
})
