/**
 * 00381 — عميل LVN مشترك لسحب السجل (get_history) — يستخدمه مستودع GPS (gps-warehouse).
 * نسخة مطابقة لسلوك lvn-gps-sync (تسجيل الدخول، الطلب، تحليل الوقت المحلي لبغداد، استخراج النقاط) دون لمس تلك الدالة.
 */
const BASE = (Deno.env.get('LVN_API_BASE_URL') ?? 'https://track.gpslvn.iq/api').replace(/\/$/, '')

export async function lvnRequest(path: string, hash?: string, params: Record<string, string> = {}, timeoutMs = 20000) {
  const url = new URL(`${BASE}${path}`)
  if (hash) url.searchParams.set('user_api_hash', hash)
  url.searchParams.set('lang', 'en')
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal })
    if (res.status === 401) throw new Error('LVN_UNAUTHORIZED')
    if (res.status === 429) throw new Error('LVN_RATE_LIMITED')
    if (!res.ok) throw new Error(`LVN_HTTP_${res.status}`)
    return await res.json()
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('LVN_TIMEOUT')
    throw e
  } finally { clearTimeout(timer) }
}

export async function lvnLogin() {
  const email = Deno.env.get('LVN_API_EMAIL'), password = Deno.env.get('LVN_API_PASSWORD')
  if (!email || !password) throw new Error('LVN_CONFIG_MISSING')
  const form = new FormData()
  form.set('email', email)
  form.set('password', password)
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000)
  try {
    const res = await fetch(`${BASE}/login`, { method: 'POST', body: form, headers: { Accept: 'application/json' }, signal: controller.signal })
    if (!res.ok) throw new Error(res.status === 401 ? 'LVN_LOGIN_REJECTED' : `LVN_LOGIN_HTTP_${res.status}`)
    const data = (await res.json()) as { user_api_hash?: string }
    if (!data.user_api_hash) throw new Error('LVN_LOGIN_HASH_MISSING')
    return data.user_api_hash
  } finally { clearTimeout(timer) }
}

/** وقت LVN: epoch أو «YYYY-MM-DD HH:MM:SS» بتوقيت الحساب (بغداد +03 طوال السنة) */
export function parseLvnHistoryTime(value: unknown): string | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  if (/^\d{10,13}$/.test(raw)) {
    const epoch = Number(raw), date = new Date(epoch < 1e12 ? epoch * 1000 : epoch)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(raw)) {
    const date = new Date(`${raw.replace(' ', 'T')}+03:00`)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export interface WarehousePoint { t: string; lat: number; lng: number; speed: number | null; course: number | null }
const num = (v: unknown): number | null => { const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN; return Number.isFinite(n) ? n : null }

/** استخراج نقاط get_history إلى الشكل المضغوط الذي يخزّنه المستودع؛ النقاط بلا وقت/إحداثيات صالحة تُهمل وتُعدّ ضمن source */
export function historyToWarehousePoints(value: unknown): { points: WarehousePoint[]; source: number } {
  const root = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const segments = Array.isArray(value) ? value : Array.isArray(root.items) ? root.items : []
  const points: WarehousePoint[] = []
  let source = 0
  for (const segment of segments) {
    if (!segment || typeof segment !== 'object') continue
    const row = segment as Record<string, unknown>
    const nested = Array.isArray(row.items) ? row.items : []
    for (const candidate of nested.length ? nested : [row]) {
      source++
      if (!candidate || typeof candidate !== 'object') continue
      const item = candidate as Record<string, unknown>
      const t = parseLvnHistoryTime(item.raw_time ?? item.time ?? row.raw_time ?? row.time)
      const lat = num(item.latitude ?? item.lat), lng = num(item.longitude ?? item.lng)
      if (!t || lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) continue
      points.push({ t, lat, lng, speed: num(item.speed), course: num(item.course) })
    }
  }
  return { points, source }
}

/** أجزاء التاريخ/الوقت بتوقيت بغداد كما تطلبها LVN */
export function baghdadParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((x) => x.type === type)?.value ?? ''
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}:${get('second')}` }
}
/** حدود يوم بغداد [00:00, 24:00) بتوقيت UTC */
export const baghdadDayRange = (day: string) => ({ from: new Date(`${day}T00:00:00+03:00`), to: new Date(new Date(`${day}T00:00:00+03:00`).getTime() + 86400000) })
