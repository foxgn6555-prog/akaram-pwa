/**
 * Edge Function: biometric-pull — السحب اليدوي لبيانات البصمة (بوابة التطوير المركزية).
 *
 *   POST { action: 'test' | 'pull', device_id, from?, to? }   (Authorization: Bearer <jwt للمستخدم>)
 *     · test : يتحقق من الاتصال بالمصدر ويعيد عدد السجلات المتاحة دون إدراج.
 *     · pull : يسحب النافذة ويطبّع ويرسل إلى RPC biometric_import_punches (تكرار/مطابقة/سجل).
 *
 *   الأمان: it_admin/super_admin فقط (يُتحقق من user_roles). أي فشل اتصال/تنسيق يُسجل في
 *   biometric_pulls بحالة failed (بدور الخدمة) كي يبقى سجل العمليات كاملاً.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import {
  BiometricProviderError, buildPullRequest, dedupePunches, isPullMode,
  normalizeResponse, resolveWindow, validateConfig,
} from '../_shared/biometric-providers.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const errText = (e: unknown) =>
  (e instanceof Error ? e.message : String(e)).replace(/(api[_-]?key|token|password)=[^&\s]+/gi, '$1=[REDACTED]').slice(0, 900)

interface Body { action?: 'test' | 'pull'; device_id?: string; from?: string; to?: string }

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)

  // ── هوية المستخدم + الدور ──
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'UNAUTHORIZED' }, 401)
  const { data: auth, error: authErr } = await admin.auth.getUser(token)
  if (authErr || !auth?.user) return json({ error: 'UNAUTHORIZED' }, 401)
  const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', auth.user.id)
  const allowed = (roles ?? []).some((r: { role: string }) => r.role === 'it_admin' || r.role === 'super_admin')
  if (!allowed) return json({ error: 'BIO_FORBIDDEN' }, 403)

  // عميل بهوية المستخدم لتمرّ RPC بصلاحياته (auth.uid داخل الدالة = المستخدم)
  const asUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false },
  })

  let body: Body
  try { body = await req.json() } catch { return json({ error: 'BAD_JSON' }, 400) }
  const action = body.action ?? 'pull'
  if (!body.device_id) return json({ error: 'BIO_DEVICE_REQUIRED' }, 400)

  const { data: device, error: devErr } = await admin
    .from('biometric_devices').select('id, serial_number, name, mode, config, is_active').eq('id', body.device_id).maybeSingle()
  if (devErr) return json({ error: errText(devErr) }, 500)
  if (!device) return json({ error: 'BIO_DEVICE_NOT_FOUND' }, 404)
  if (!device.is_active) return json({ error: 'BIO_DEVICE_INACTIVE' }, 409)
  if (!isPullMode(device.mode)) return json({ error: 'BIO_MODE_NOT_PULLABLE', mode: device.mode }, 409)

  const started = new Date().toISOString()
  const fail = async (code: string, detail?: string, status = 502) => {
    await admin.from('biometric_pulls').insert({
      device_id: device.id, mode: device.mode, status: 'failed', error: detail ? `${code}: ${detail}` : code,
      triggered_by: auth.user.id, started_at: started, finished_at: new Date().toISOString(),
    })
    return json({ error: code, detail }, status)
  }

  try {
    const config = validateConfig(device.mode, device.config)
    const { fromIso, toIso } = resolveWindow(body.from, body.to)
    const request = buildPullRequest(device.mode, config, fromIso, toIso)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 25000)
    let res: Response
    try {
      res = await fetch(request.url, { headers: request.headers, signal: controller.signal })
    } catch (e) {
      return await fail('BIO_SOURCE_UNREACHABLE', errText(e))
    } finally {
      clearTimeout(timer)
    }
    if (res.status === 401 || res.status === 403) return await fail('BIO_SOURCE_UNAUTHORIZED', `HTTP ${res.status}`, 502)
    if (!res.ok) return await fail('BIO_SOURCE_HTTP', `HTTP ${res.status}`, 502)

    const contentType = res.headers.get('content-type') ?? ''
    const raw = contentType.includes('json') ? await res.json() : await res.text()
    const payload = typeof raw === 'string' && device.mode !== 'lan_pull' ? tryJson(raw) : raw
    const punches = dedupePunches(normalizeResponse(device.mode, config, payload))

    if (action === 'test') {
      return json({ ok: true, mode: device.mode, available: punches.length, window: { from: fromIso, to: toIso }, sample: punches.slice(0, 3) })
    }

    if (punches.length === 0) {
      await admin.from('biometric_pulls').insert({
        device_id: device.id, mode: device.mode, status: 'success', received: 0, inserted: 0,
        triggered_by: auth.user.id, started_at: started, finished_at: new Date().toISOString(),
      })
      return json({ ok: true, received: 0, inserted: 0, duplicates: 0, unmatched: 0, window: { from: fromIso, to: toIso } })
    }

    const { data, error } = await asUser.rpc('biometric_import_punches', { p_device_id: device.id, p_logs: punches, p_method: device.mode })
    if (error) return await fail('BIO_IMPORT_FAILED', errText(error), 500)
    const row = Array.isArray(data) ? data[0] : data
    return json({ ok: true, ...row, window: { from: fromIso, to: toIso } })
  } catch (e) {
    if (e instanceof BiometricProviderError) return await fail(e.code, e.message, 400)
    return await fail('BIO_PULL_FAILED', errText(e), 500)
  }
})

function tryJson(text: string): unknown {
  try { return JSON.parse(text) } catch { return text }
}
