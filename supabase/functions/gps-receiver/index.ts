/**
 * Edge Function: gps-receiver — مستقبل مواقع الشاحنات من كل المزودين
 *
 * الصيغ المدعومة:
 *  ① Webhook بصيغة Traccar (JSON): { position: {...}, device: {...} }
 *  ② OsmAnd HTTP GET: ?id={uniqueId}&lat={..}&lon={..}&speed={..}&timestamp={..}
 *
 * الأمان: X-Api-Key header (أو apikey query) يجب أن يطابق gps_providers.api_key
 *         لمزود نشط — وإلا رفض فوري + تسجيل.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

interface TraccarPayload {
  position?: {
    deviceId?: number
    latitude?: number
    longitude?: number
    speed?: number      // knots في Traccar — نحوله
    course?: number
    attributes?: { ignition?: boolean; motion?: boolean }
    fixTime?: string
    deviceTime?: string
  }
  device?: { uniqueId?: string }
}

async function log(provider: string, status: string, note?: string, endpoint?: string): Promise<void> {
  await admin.from('integration_logs').insert({
    provider, direction: 'inbound', status, endpoint,
    error_note: note,
    payload: { at: new Date().toISOString() },
  })
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url)

  // ── ① التحقق من المزود عبر API key ──
  const apiKey = req.headers.get('x-api-key') ?? url.searchParams.get('apikey') ?? ''
  if (!apiKey) {
    await log('gps', 'rejected', 'NO_API_KEY')
    return json({ error: 'API key required' }, 401)
  }

  const { data: provider } = await admin
    .from('gps_providers')
    .select('id, name, type')
    .eq('api_key', apiKey)
    .eq('is_active', true)
    .maybeSingle()

  if (!provider) {
    await log('gps', 'rejected', 'INVALID_API_KEY')
    return json({ error: 'Invalid API key' }, 401)
  }

  // ── ② استخراج القراءة حسب الصيغة ──
  let uniqueId: string | null = null
  let lat: number | null = null
  let lon: number | null = null
  let speed: number | null = null      // km/h
  let heading: number | null = null
  let ignition: boolean | null = null
  let fixTime: string = new Date().toISOString()

  if (req.method === 'GET') {
    // OsmAnd: ?id=&lat=&lon=&speed=&bearing=&timestamp=
    uniqueId = url.searchParams.get('id') ?? url.searchParams.get('deviceid')
    lat = num(url.searchParams.get('lat'))
    lon = num(url.searchParams.get('lon'))
    speed = num(url.searchParams.get('speed'))       // m/s → نحوله
    if (speed !== null) speed = Math.round(speed * 3.6 * 10) / 10
    heading = num(url.searchParams.get('bearing') ?? url.searchParams.get('heading'))
    const ts = url.searchParams.get('timestamp')
    if (ts) {
      const parsed = /^\d+$/.test(ts) ? new Date(Number(ts) * 1000) : new Date(ts)
      if (!isNaN(parsed.getTime())) fixTime = parsed.toISOString()
    }
  } else {
    // Traccar webhook JSON (أو JSON مشابه)
    try {
      const body = (await req.json()) as TraccarPayload
      uniqueId = body.device?.uniqueId ?? null
      if (body.position) {
        lat = body.position.latitude ?? null
        lon = body.position.longitude ?? null
        // Traccar speed بالعقد (knots) → km/h
        speed = body.position.speed !== undefined
          ? Math.round(body.position.speed * 1.852 * 10) / 10
          : null
        heading = body.position.course ?? null
        ignition = body.position.attributes?.ignition ?? null
        fixTime = body.position.fixTime ?? body.position.deviceTime ?? fixTime
      }
    } catch {
      await log(`gps:${provider.name}`, 'error', 'BAD_JSON')
      return json({ error: 'Invalid JSON' }, 400)
    }
  }

  if (!uniqueId || lat === null || lon === null) {
    await log(`gps:${provider.name}`, 'rejected', 'MISSING_FIELDS')
    return json({ error: 'Missing id/lat/lon' }, 400)
  }

  // ── ③ الحقن عبر الدالة الآمنة ──
  const { data: vehicleId, error } = await admin.rpc('gps_ingest', {
    p_device_unique_id: uniqueId,
    p_lat: lat,
    p_lon: lon,
    p_speed: speed,
    p_heading: heading,
    p_ignition: ignition,
    p_fix_time: fixTime,
  })

  if (error) {
    await log(`gps:${provider.name}`, 'error', error.message)
    return json({ error: 'Ingest failed' }, 500)
  }

  if (!vehicleId) {
    await log(`gps:${provider.name}`, 'rejected', `UNKNOWN_DEVICE: ${uniqueId}`)
    return json({ error: 'Unknown device' }, 404)
  }

  await log(`gps:${provider.name}`, 'success')
  return json({ ok: true, vehicle_id: vehicleId })
})

function num(v: string | null): number | null {
  if (v === null || v === '') return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
