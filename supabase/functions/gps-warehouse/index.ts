/**
 * gps-warehouse — 00380: جسر المشروع الأول ↔ مستودع GPS التحليلي (المشروع الثاني).
 * الأسرار (تُضبط من لوحة Supabase ← Edge Functions ← Secrets، لا تمرّ عبر الشيفرة):
 *   GPS_WAREHOUSE_URL          = https://<ref>.supabase.co
 *   GPS_WAREHOUSE_SERVICE_KEY  = مفتاح الخدمة (sb_secret_… أو service_role) للمشروع الثاني
 * الإجراءات: ping، sync_registry، enqueue_month، pull (00381: يعالج دفعة مهام جهاز×يوم من LVN إلى المستودع — المجدول كل دقيقة أو IT)، pause/resume.
 * المتصفح لا يعرف مفتاح المستودع أبداً؛ كل شيء يمرّ من هنا بعد التحقق من دور المستخدم.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { baghdadDayRange, baghdadParts, historyToWarehousePoints, lvnLogin, lvnRequest } from '../_shared/lvn-history.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '',
  SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  WH_URL = (Deno.env.get('GPS_WAREHOUSE_URL') ?? '').replace(/\/$/, ''),
  WH_KEY = Deno.env.get('GPS_WAREHOUSE_SERVICE_KEY') ?? ''
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })
type Action = 'ping' | 'sync_registry' | 'enqueue_month' | 'pull' | 'pause' | 'resume'
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

/* ───────────── 00381: محرّك السحب ───────────── */
type Job = { id: number; device_external_id: string; day: string; attempts: number; cursor_until: string | null; points: number }
const PULL_BUDGET_MS = Number(Deno.env.get('GPS_WAREHOUSE_PULL_BUDGET_MS') ?? 95_000)
const CHUNK_MS = 3 * 3600_000

/** يسحب يوماً واحداً لجهاز (يستأنف من cursor_until)؛ يعيد false إن نفدت الميزانية قبل الاكتمال */
async function pullJob(job: Job, hash: string, deadline: number) {
  const { from, to } = baghdadDayRange(job.day)
  const resumeFrom = job.cursor_until ? Math.max(from.getTime(), new Date(job.cursor_until).getTime()) : from.getTime()
  let inserted = 0, source = 0
  for (let start = resumeFrom; start < to.getTime(); start += CHUNK_MS) {
    if (Date.now() > deadline) return { complete: false, inserted, source }
    const a = new Date(start), b = new Date(Math.min(start + CHUNK_MS, to.getTime())), fa = baghdadParts(a), fb = baghdadParts(b)
    const payload = await lvnRequest('/get_history', hash, { device_id: job.device_external_id, from_date: fa.date, from_time: fa.time, to_date: fb.date, to_time: fb.time, snap_to_road: 'false' })
    const { points, source: src } = historyToWarehousePoints(payload)
    const r = await whRpc<{ inserted: number }>('wh_ingest_points', { p_job_id: job.id, p_points: points, p_cursor_until: b.toISOString(), p_source: src })
    inserted += Number(r?.inserted ?? 0); source += src
  }
  return { complete: true, inserted, source }
}

/** أرشفة يوم منجز: ضغط النقاط (gzip) ورفعها إلى دلو gps-archive في المستودع ثم التعليم — أفضل جهد، لا تُفشل السحب */
async function archiveDay(item: { device_external_id: string; day: string; points: number }) {
  const pts = await whRpc<unknown[]>('wh_day_points', { p_device: item.device_external_id, p_day: item.day })
  const json = JSON.stringify({ v: 1, device: item.device_external_id, day: item.day, cols: ['epoch', 'lat', 'lng', 'speed', 'course'], points: pts })
  const gz = await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()
  const path = `${item.day.slice(0, 4)}/${item.day.slice(5, 7)}/${item.day}/${encodeURIComponent(item.device_external_id)}.json.gz`
  const { error } = await warehouse().storage.from('gps-archive').upload(path, new Blob([gz], { type: 'application/gzip' }), { upsert: true, contentType: 'application/gzip' })
  if (error) throw new Error(`GPS_WAREHOUSE_ARCHIVE_FAILED: ${safeError(error.message)}`)
  await whRpc('wh_archive_mark', { p_device: item.device_external_id, p_day: item.day, p_path: path, p_bytes: gz.byteLength, p_points: Array.isArray(pts) ? pts.length : item.points })
  return { path, bytes: gz.byteLength }
}

async function runPull(limit: number) {
  const startedAt = Date.now(), deadline = startedAt + PULL_BUDGET_MS
  const claim = await whRpc<{ locked: boolean; paused: boolean; jobs: Job[] }>('wh_jobs_claim', { p_limit: limit })
  if (claim.paused) return { ok: true, action: 'pull' as const, skipped: 'paused' }
  if (claim.locked) return { ok: true, action: 'pull' as const, skipped: 'locked' }
  const results: Array<Record<string, unknown>> = []
  let hash: string | null = null
  try {
    if (claim.jobs.length) {
      try { hash = await lvnLogin() } catch (e) {
        const code = safeError(e).split(':')[0]
        for (const job of claim.jobs) await whRpc('wh_job_finish', { p_job_id: job.id, p_ok: false, p_error: code })
        throw e
      }
      for (const job of claim.jobs) {
        if (Date.now() > deadline) { await whRpc('wh_job_release', { p_job_id: job.id }); results.push({ job: job.id, released: true }); continue }
        try {
          const r = await pullJob(job, hash, deadline)
          if (!r.complete) { await whRpc('wh_job_release', { p_job_id: job.id }); results.push({ job: job.id, day: job.day, device: job.device_external_id, partial: true, inserted: r.inserted }); continue }
          const fin = await whRpc<Record<string, unknown>>('wh_job_finish', { p_job_id: job.id, p_ok: true })
          results.push({ job: job.id, day: job.day, device: job.device_external_id, inserted: r.inserted, source: r.source, ...fin })
        } catch (e) {
          const code = safeError(e).split(':')[0]
          await whRpc('wh_job_finish', { p_job_id: job.id, p_ok: false, p_error: code }).catch(() => null)
          results.push({ job: job.id, day: job.day, device: job.device_external_id, error: code })
        }
      }
    }
    // أرشفة + صيانة ضمن ما تبقى من الميزانية
    const archived: unknown[] = []
    if (Date.now() < deadline - 10_000) {
      const pending = await whRpc<Array<{ device_external_id: string; day: string; points: number }>>('wh_archive_pending', { p_limit: 3 })
      for (const item of pending) {
        if (Date.now() > deadline - 5_000) break
        try { archived.push({ ...item, ...(await archiveDay(item)) }) } catch (e) { archived.push({ ...item, error: safeError(e).split(':')[0] }) }
      }
      const expired = await whRpc<Array<{ id: number; path: string }>>('wh_archive_expired', { p_limit: 50 })
      if (expired.length) {
        const { error } = await warehouse().storage.from('gps-archive').remove(expired.map((x) => x.path))
        if (!error) await whRpc('wh_archive_forget', { p_ids: expired.map((x) => x.id) })
      }
    }
    const maintenance = await whRpc<Record<string, unknown>>('wh_maintenance')
    return { ok: true, action: 'pull' as const, jobs: claim.jobs.length, results, archived, maintenance, ms: Date.now() - startedAt }
  } finally {
    await whRpc('wh_pull_release').catch(() => null)
    // تحديث حالة الربط (الأعداد والتقدّم) بعد كل دورة — تظهر في بطاقة IT بلا ضغط «فحص»
    await whRpc<Record<string, unknown>>('wh_ping').then((p) => record('ping', true, p)).catch(() => null)
  }
}

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors
  if (req.method !== 'POST') return response({ error: 'METHOD_NOT_ALLOWED' }, 405)
  const user = await actor(req)
  if (!user) return response({ error: 'GPS_WAREHOUSE_FORBIDDEN' }, 403)
  let body: { action?: Action; month?: string; limit?: number } = {}
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
    if (action === 'pull') {
      // المجدول (مفتاح الخدمة) أو IT يدوياً؛ الموظفون لا يسحبون
      return response(await runPull(Math.min(Math.max(Number(body.limit) || 3, 1), 10)))
    }
    if (action === 'pause' || action === 'resume') {
      const result = await whRpc<Record<string, unknown>>('wh_set_paused', { p_paused: action === 'pause' })
      return response({ ok: true, action, result })
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
