/**
 * Edge Function: biometric-bridge — نقطة استلام وكيل جسر الشبكة الداخلية (zk_bridge).
 *
 *   POST  Headers: X-Device-Serial, X-Bridge-Key   Body: BridgeBody (انظر _shared/bridge-protocol.ts)
 *   → 200 { ok, received, inserted, duplicates, unmatched, users }
 *
 *   الأمان: لا JWT (الوكيل يعمل على حاسوب داخل الجهة) — المصادقة بمفتاح لكل جهاز مجزأ في القاعدة
 *   (biometric_bridge_authenticate_public، متاح لدور الخدمة فقط). نشر: `supabase functions deploy biometric-bridge --no-verify-jwt`.
 *   الاستيراد بدور الخدمة عبر biometric_bridge_import_public (تكرار/مطابقة/أسماء/سجل العمليات).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { BridgeValidationError, validateBridgeBody } from '../_shared/bridge-protocol.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)

  const serial = (req.headers.get('X-Device-Serial') ?? '').trim()
  const key = (req.headers.get('X-Bridge-Key') ?? '').trim()
  if (!serial || !key) return json({ error: 'BRIDGE_CREDENTIALS_MISSING' }, 401)

  const { data: deviceId, error: authErr } = await admin.rpc('biometric_bridge_authenticate_public', { p_serial: serial, p_key: key })
  if (authErr) return json({ error: 'BRIDGE_AUTH_ERROR', detail: authErr.message }, 500)
  if (!deviceId) return json({ error: 'BRIDGE_UNAUTHORIZED' }, 401)

  let body
  try { body = validateBridgeBody(await req.json().catch(() => null)) }
  catch (e) {
    if (e instanceof BridgeValidationError) return json({ error: e.code, detail: e.message }, 400)
    throw e
  }

  const { data, error } = await admin.rpc('biometric_bridge_import_public', {
    p_device_id: deviceId, p_punches: body.punches, p_users: body.users ?? [], p_error: body.error ?? null,
  })
  if (error) return json({ error: 'BRIDGE_IMPORT_FAILED', detail: error.message }, 500)
  const row = Array.isArray(data) ? data[0] : data
  return json({ ok: !body.error, ...(row ?? {}) })
})
