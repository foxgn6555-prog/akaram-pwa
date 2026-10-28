import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '',
  SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  BASE = (Deno.env.get('LVN_API_BASE_URL') ?? 'https://track.gpslvn.iq/api').replace(/\/$/, '')
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })
type Action = 'test' | 'full' | 'incremental' | 'history' | 'trips' | 'trip' | 'stops'
interface SyncBody {
  action?: Action
  deviceId?: string
  departureId?: string
  windowIndex?: number
  day?: string
  limit?: number
}
interface LvnLatest {
  items?: unknown[]
  events?: unknown[]
  time?: string | number
  version?: string
}
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
function safeError(error: unknown) {
  const text = error instanceof Error ? error.message : String(error)
  return text
    .replace(/user_api_hash=[^&\s]+/gi, 'user_api_hash=[REDACTED]')
    .replace(/\$2[ayb]\$[^\s&]+/g, '[REDACTED]')
    .slice(0, 900)
}
async function request(path: string, hash?: string, params: Record<string, string> = {}) {
  const url = new URL(`${BASE}${path}`)
  if (hash) url.searchParams.set('user_api_hash', hash)
  url.searchParams.set('lang', 'en')
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 20000)
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (res.status === 401) throw new Error('LVN_UNAUTHORIZED')
    if (!res.ok) throw new Error(`LVN_HTTP_${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}
async function login() {
  const email = Deno.env.get('LVN_API_EMAIL'),
    password = Deno.env.get('LVN_API_PASSWORD')
  if (!email || !password) throw new Error('LVN_CONFIG_MISSING')
  const form = new FormData()
  form.set('email', email)
  form.set('password', password)
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 20000)
  try {
    const res = await fetch(`${BASE}/login`, {
      method: 'POST',
      body: form,
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!res.ok)
      throw new Error(res.status === 401 ? 'LVN_LOGIN_REJECTED' : `LVN_LOGIN_HTTP_${res.status}`)
    const data = (await res.json()) as { status?: number; user_api_hash?: string; message?: string }
    if (!data.user_api_hash) throw new Error('LVN_LOGIN_HASH_MISSING')
    return data.user_api_hash
  } finally {
    clearTimeout(timer)
  }
}
async function actor(req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  // Supabase Cron invokes with the service-role token; interactive calls still require an authorized user.
  if (token === SERVICE_ROLE) return { id: null, scheduler: true }
  // 00366: المزامنة التفاعلية تُستدعى كل ثانية؛ استدعاء auth.getUser لكل طلب يصطدم بحدّ معدل المصادقة ⇒ 403 متكررة.
  // نخزّن نتيجة التحقق لكل رمز لمدة قصيرة (أقل من صلاحية الرمز) بدل إعادة التحقق في كل طلب.
  const cached = actorCache.get(token)
  if (cached && cached.until > Date.now()) return cached.user
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) {
    // خطأ معدل/شبكة مؤقت: لا نُسقط جلسة كانت صالحة قبل لحظات
    if (cached?.user && error && (error.status === 429 || (error.status ?? 0) >= 500)) return cached.user
    return null
  }
  const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', data.user.id)
  const user = roles?.some(({ role }) => ['ops_room', 'it_admin', 'super_admin'].includes(role)) ? data.user : null
  if (actorCache.size > 200) actorCache.clear()
  actorCache.set(token, { user, until: Date.now() + ACTOR_CACHE_MS })
  return user
}
const ACTOR_CACHE_MS = 60_000
const STALE_RUN_MS = 3 * 60_000
const actorCache = new Map<string, { user: { id: string } | null; until: number }>()
async function apply(
  providerId: string,
  items: unknown[],
  cursor: string | null,
  version: string | null,
  type: 'full' | 'incremental',
) {
  const { data, error } = await admin.rpc('lvn_apply_devices', {
    p_provider_id: providerId,
    p_items: items,
    p_cursor: cursor,
    p_api_version: version,
    p_sync_type: type,
  })
  if (error) throw new Error(`LVN_APPLY_FAILED:${error.code ?? 'DB'}`)
  const row = (data?.[0] ?? {}) as {
    received_count?: number
    inserted_count?: number
    updated_count?: number
  }
  return {
    received: Number(row.received_count ?? 0),
    inserted: Number(row.inserted_count ?? 0),
    updated: Number(row.updated_count ?? 0),
  }
}
function eventDeviceId(event: Record<string, unknown>) {
  const nested = event.device
  return String(
    event.device_id ??
      event.item_id ??
      (nested && typeof nested === 'object' ? (nested as Record<string, unknown>).id : '') ??
      '',
  )
}
async function saveEvents(providerId: string, events: unknown[]) {
  const valid = events.filter(
    (event): event is Record<string, unknown> => Boolean(event) && typeof event === 'object',
  )
  if (!valid.length) return 0
  const externalIds = [...new Set(valid.map(eventDeviceId).filter(Boolean))]
  const { data: devices } = externalIds.length
    ? await admin
        .from('gps_devices')
        .select('id,external_id')
        .eq('provider_id', providerId)
        .in('external_id', externalIds)
    : { data: [] }
  const deviceMap = new Map((devices ?? []).map((d) => [String(d.external_id), String(d.id)]))
  const rows = valid.map((e, index) => {
    const deviceExternal = eventDeviceId(e),
      rawTime = e.occurred_at ?? e.time ?? e.timestamp,
      epoch =
        typeof rawTime === 'number' || /^\d+$/.test(String(rawTime ?? '')) ? Number(rawTime) : null,
      date = epoch
        ? new Date(epoch < 1e12 ? epoch * 1000 : epoch)
        : new Date(String(rawTime ?? Date.now())),
      kind = String(e.type ?? e.event_type ?? e.name ?? 'event'),
      eventDate = Number.isNaN(date.getTime()) ? new Date() : date
    return {
      provider_id: providerId,
      device_id: deviceMap.get(deviceExternal) ?? null,
      external_event_id: String(
        e.id ?? e.event_id ?? `${deviceExternal}:${kind}:${eventDate.toISOString()}:${index}`,
      ),
      event_type: kind,
      occurred_at: eventDate.toISOString(),
      payload: e,
    }
  })
  const { error } = await admin
    .from('gps_vendor_events')
    .upsert(rows, { onConflict: 'provider_id,external_event_id', ignoreDuplicates: true })
  if (error) throw new Error(`LVN_EVENTS_FAILED:${error.code ?? 'DB'}`)
  return rows.length
}
function jsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
function parseLvnHistoryTime(value: unknown) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  if (/^\d{10,13}$/.test(raw)) {
    const epoch = Number(raw)
    const date = new Date(epoch < 1e12 ? epoch * 1000 : epoch)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(raw)) {
    // LVN history displays account-local wall time. Baghdad is UTC+03 year-round.
    const date = new Date(`${raw.replace(' ', 'T')}+03:00`)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
function historyPoints(value: unknown) {
  const root = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const segments = Array.isArray(value) ? value : Array.isArray(root.items) ? root.items : []
  const points: Record<string, unknown>[] = []
  let sourcePoints = 0
  for (const segment of segments) {
    if (!segment || typeof segment !== 'object') continue
    const row = segment as Record<string, unknown>
    const nested = Array.isArray(row.items) ? row.items : []
    const candidates = nested.length ? nested : [row]
    for (const candidate of candidates) {
      sourcePoints++
      if (!candidate || typeof candidate !== 'object') continue
      const item = candidate as Record<string, unknown>
      const fixTime = parseLvnHistoryTime(item.raw_time ?? item.time ?? row.raw_time ?? row.time)
      if (!fixTime) continue
      points.push({
        ...item,
        latitude: item.latitude ?? item.lat,
        longitude: item.longitude ?? item.lng,
        fix_time: fixTime,
        segment_status: row.status ?? null,
      })
    }
  }
  return { points, sourcePoints }
}
/**
 * 00364 — بقع التوقف: سحب سجل المواقع من LVN مباشرة لكل أجهزة GPS الفعّالة (المربوطة وغير المربوطة)
 * على دفعات من طابور خادمي (gps_stop_pull_queue)، ثم إعادة حساب البقع. كل نداء يعالج حتى `limit` أجهزة × نافذة ≤ 24 ساعة.
 */
type StopPullItem = { device_id: string; external_id: string; device_name: string; pull_from: string; pull_to: string; pulled_until: string | null; direction: 'forward' | 'backward' }
async function pullStopHistory(providerId: string, hash: string, limit: number) {
  const { data: queue, error } = await admin.rpc('gps_stop_pull_queue', { p_limit: limit })
  if (error) throw new Error(`STOPS_QUEUE_FAILED:${error.code ?? 'DB'}`)
  const items = (Array.isArray(queue) ? queue : []) as StopPullItem[]
  const chunkMs = 3 * 3600000   // 00365: قطع صغيرة — حدود CPU/الوقت في الحافة
  let inserted = 0, source = 0, failed = 0
  const results: Array<{ device: string; from: string; to: string; direction: string; inserted: number; error?: string }> = []
  for (const item of items) {
    const from = new Date(item.pull_from), to = new Date(item.pull_to)
    let devInserted = 0, devSource = 0
    try {
      for (let start = from.getTime(); start < to.getTime(); start += chunkMs) {
        const a = new Date(start), b = new Date(Math.min(start + chunkMs, to.getTime())),
          fa = baghdadParts(a), fb = baghdadParts(b),
          payload = await request('/get_history', hash, {
            device_id: item.external_id, from_date: fa.date, from_time: fa.time, to_date: fb.date, to_time: fb.time, snap_to_road: 'false',
          }),
          extracted = historyPoints(payload),
          applied = await admin.rpc('lvn_apply_history_points', {
            p_provider_id: providerId, p_device_id: item.device_id, p_points: extracted.points, p_source_points: extracted.sourcePoints,
            p_range_from: a.toISOString(), p_range_to: b.toISOString(),
          })
        if (applied.error) throw new Error(`LVN_HISTORY_APPLY_FAILED:${applied.error.code ?? 'DB'}`)
        const row = (applied.data?.[0] ?? {}) as Record<string, number>
        devInserted += Number(row.inserted_count ?? 0)
        devSource += extracted.sourcePoints
      }
      await admin.rpc('gps_stop_pull_mark', { p_device_id: item.device_id, p_from: from.toISOString(), p_until: to.toISOString(), p_points: devInserted, p_error: null })
      results.push({ device: item.device_name, from: item.pull_from, to: item.pull_to, direction: item.direction, inserted: devInserted })
    } catch (e) {
      failed++
      const code = safeError(e).split(':')[0]
      await admin.rpc('gps_stop_pull_mark', { p_device_id: item.device_id, p_from: from.toISOString(), p_until: to.toISOString(), p_points: devInserted, p_error: code })
      results.push({ device: item.device_name, from: item.pull_from, to: item.pull_to, direction: item.direction, inserted: devInserted, error: code })
    }
    inserted += devInserted
    source += devSource
  }
  const { data: refresh } = await admin.rpc('gps_stop_hotspots_refresh_service', { p_budget_ms: 15000 })
  return { ok: true, action: 'stops' as const, devices: items.length, inserted, source, failed, remaining: items.length >= limit, refresh, results }
}

function baghdadParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((x) => x.type === type)?.value ?? ''
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}:${get('second')}`,
  }
}
async function importHistory(
  provider: { id: string },
  userId: string | null,
  hash: string,
  body: SyncBody,
) {
  let device: { id: string; external_id: string } | null = null,
    departureId: string | null = null,
    rangeFrom: Date,
    rangeTo: Date,
    rangeTruncated = false
  if (body.departureId) {
    const { data: departure, error } = await admin
      .from('garage_departures')
      .select('id,departed_at,returned_at,vehicle_id')
      .eq('id', body.departureId)
      .maybeSingle()
    if (error || !departure) throw new Error('GPS_HISTORY_TARGET_NOT_FOUND')
    const { data: binding } = await admin
      .from('gps_vehicle_bindings')
      .select('device_id,gps_devices!inner(id,external_id,is_active)')
      .eq('garage_vehicle_id', departure.vehicle_id)
      .maybeSingle()
    const linked = binding?.gps_devices as unknown as {
      id: string
      external_id: string
      is_active: boolean
    } | null
    if (!linked?.is_active) throw new Error('GPS_HISTORY_DEVICE_UNBOUND')
    device = { id: linked.id, external_id: linked.external_id }
    departureId = departure.id
    const windowIndex = body.windowIndex ?? 0
    if (!Number.isInteger(windowIndex) || windowIndex < 0 || windowIndex > 124)
      throw new Error('GPS_HISTORY_WINDOW_INVALID')
    const departureStart = new Date(departure.departed_at),
      actualEnd = new Date(departure.returned_at ?? Date.now())
    rangeFrom = new Date(departureStart.getTime() + windowIndex * 72 * 3600000)
    if (rangeFrom >= actualEnd) throw new Error('GPS_HISTORY_WINDOW_OUT_OF_RANGE')
    const maxEnd = new Date(rangeFrom.getTime() + 72 * 3600000)
    rangeTruncated = actualEnd > maxEnd
    rangeTo = actualEnd > maxEnd ? maxEnd : actualEnd
  } else {
    if (!body.deviceId || !/^\d{4}-\d{2}-\d{2}$/.test(body.day ?? ''))
      throw new Error('GPS_HISTORY_TARGET_INVALID')
    const { data } = await admin
      .from('gps_devices')
      .select('id,external_id')
      .eq('id', body.deviceId)
      .eq('is_active', true)
      .maybeSingle()
    if (!data) throw new Error('GPS_HISTORY_TARGET_NOT_FOUND')
    device = data
    rangeFrom = new Date(`${body.day}T00:00:00+03:00`)
    rangeTo = new Date(Math.min(rangeFrom.getTime() + 86400000, Date.now()))
  }
  if (!device || Number.isNaN(rangeFrom.getTime()) || rangeTo <= rangeFrom)
    throw new Error('GPS_HISTORY_RANGE_INVALID')
  await admin
    .from('gps_history_import_runs')
    .update({
      status: 'failed',
      error_code: 'GPS_HISTORY_STALE_RUN',
      finished_at: new Date().toISOString(),
    })
    .eq('device_id', device.id)
    .eq('status', 'running')
    .lt('started_at', new Date(Date.now() - 10 * 60000).toISOString())
  const chunkMs = 12 * 3600000,
    chunks = Math.ceil((rangeTo.getTime() - rangeFrom.getTime()) / chunkMs)
  const { data: run, error: runError } = await admin
    .from('gps_history_import_runs')
    .insert({
      provider_id: provider.id,
      device_id: device.id,
      departure_id: departureId,
      requested_by: userId,
      range_from: rangeFrom.toISOString(),
      range_to: rangeTo.toISOString(),
      chunks_requested: chunks,
    })
    .select('id')
    .single()
  if (runError || !run)
    throw new Error(
      runError?.code === '23505' ? 'LVN_HISTORY_ALREADY_RUNNING' : 'LVN_HISTORY_RUN_CREATE_FAILED',
    )
  let completed = 0,
    source = 0,
    valid = 0,
    inserted = 0,
    stored = 0,
    rejected = 0
  try {
    for (let start = rangeFrom.getTime(); start < rangeTo.getTime(); start += chunkMs) {
      const from = new Date(start),
        to = new Date(Math.min(start + chunkMs, rangeTo.getTime())),
        fromLocal = baghdadParts(from),
        toLocal = baghdadParts(to),
        payload = await request('/get_history', hash, {
          device_id: device.external_id,
          from_date: fromLocal.date,
          from_time: fromLocal.time,
          to_date: toLocal.date,
          to_time: toLocal.time,
          snap_to_road: 'false',
        }),
        extracted = historyPoints(payload),
        result = await admin.rpc('lvn_apply_history_points', {
          p_provider_id: provider.id,
          p_device_id: device.id,
          p_points: extracted.points,
          p_source_points: extracted.sourcePoints,
          p_range_from: from.toISOString(),
          p_range_to: to.toISOString(),
        })
      if (result.error) throw new Error(`LVN_HISTORY_APPLY_FAILED:${result.error.code ?? 'DB'}`)
      const row = (result.data?.[0] ?? {}) as Record<string, number>
      completed++
      source += extracted.sourcePoints
      valid += Number(row.valid_count ?? 0)
      inserted += Number(row.inserted_count ?? 0)
      stored = Number(row.stored_count ?? stored)
      rejected += Number(row.rejected_count ?? 0)
    }
    const { count } = await admin
      .from('gps_device_position_history')
      .select('id', { count: 'exact', head: true })
      .eq('device_id', device.id)
      .gte('fix_time', rangeFrom.toISOString())
      .lte('fix_time', rangeTo.toISOString())
    stored = count ?? stored
    const status = rejected > 0 || completed < chunks ? 'partial' : 'success'
    await admin
      .from('gps_history_import_runs')
      .update({
        status,
        chunks_completed: completed,
        source_points: source,
        valid_points: valid,
        inserted_points: inserted,
        stored_points: stored,
        duplicate_points: Math.max(valid - inserted, 0),
        rejected_points: rejected,
        finished_at: new Date().toISOString(),
      })
      .eq('id', run.id)
    return {
      ok: true,
      action: 'history',
      status,
      sourcePoints: source,
      validPoints: valid,
      insertedPoints: inserted,
      storedPoints: stored,
      rejectedPoints: rejected,
      chunks,
      rangeTruncated,
      windowIndex: body.departureId ? (body.windowIndex ?? 0) : undefined,
      nextWindowIndex: body.departureId && rangeTruncated ? (body.windowIndex ?? 0) + 1 : undefined,
    }
  } catch (error) {
    await admin
      .from('gps_history_import_runs')
      .update({
        status: 'failed',
        chunks_completed: completed,
        source_points: source,
        valid_points: valid,
        inserted_points: inserted,
        stored_points: stored,
        rejected_points: rejected,
        error_code: safeError(error).split(':')[0],
        finished_at: new Date().toISOString(),
      })
      .eq('id', run.id)
    throw error
  }
}
/* ─────────────── 00342: مسارات الانطلاقيات ───────────────
 * تسحب نقاط LVN لفترة الانطلاقية بالضبط (من المغادرة حتى العودة/الآن) على دفعات 12 ساعة، ثم trip_route_apply تنظّف وتقسّم وتحسب.
 * الطابور trip_route_pull_queue يحدد ما يُسحب الآن (مفتوحة كل live_pull_minutes، أو عادت ولم تُسحب نهائياً). */
interface TripQueueItem {
  departure_id: string
  device_id: string
  external_id: string
  range_from: string
  range_to: string
  final: boolean
}
async function pullTripRoute(hash: string, item: TripQueueItem) {
  const rangeFrom = new Date(item.range_from),
    rangeTo = new Date(item.range_to),
    chunkMs = 12 * 3600000
  if (Number.isNaN(rangeFrom.getTime()) || rangeTo <= rangeFrom) throw new Error('TRIP_ROUTE_RANGE_INVALID')
  if (rangeTo.getTime() - rangeFrom.getTime() > 7 * 86400000) throw new Error('TRIP_ROUTE_RANGE_TOO_LONG')
  const points: Record<string, unknown>[] = []
  let sourcePoints = 0
  for (let start = rangeFrom.getTime(); start < rangeTo.getTime(); start += chunkMs) {
    const from = new Date(start),
      to = new Date(Math.min(start + chunkMs, rangeTo.getTime())),
      fromLocal = baghdadParts(from),
      toLocal = baghdadParts(to),
      payload = await request('/get_history', hash, {
        device_id: item.external_id,
        from_date: fromLocal.date,
        from_time: fromLocal.time,
        to_date: toLocal.date,
        to_time: toLocal.time,
        snap_to_road: 'false',
      }),
      extracted = historyPoints(payload)
    points.push(...extracted.points)
    sourcePoints += extracted.sourcePoints
  }
  const { data, error } = await admin.rpc('trip_route_apply', {
    p_departure: item.departure_id,
    p_points: points,
    p_source_points: sourcePoints,
    p_range_from: rangeFrom.toISOString(),
    p_range_to: rangeTo.toISOString(),
    p_final: item.final,
  })
  if (error) throw new Error(`TRIP_ROUTE_APPLY_FAILED:${error.code ?? 'DB'}`)
  return data as Record<string, unknown>
}
async function processTripQueue(hash: string, limit: number) {
  const { data, error } = await admin.rpc('trip_route_pull_queue', { p_limit: limit })
  if (error) throw new Error(`TRIP_ROUTE_QUEUE_FAILED:${error.code ?? 'DB'}`)
  const items = (Array.isArray(data) ? data : []) as TripQueueItem[]
  const results: Array<{ departure_id: string; ok: boolean; status?: string; points?: number; error?: string }> = []
  for (const item of items) {
    try {
      const r = await pullTripRoute(hash, item)
      results.push({ departure_id: item.departure_id, ok: true, status: String(r.status ?? ''), points: Number(r.points_kept ?? 0) })
    } catch (e) {
      const code = safeError(e).split(':')[0]
      await admin.rpc('trip_route_mark_failed', { p_departure: item.departure_id, p_error: code })
      results.push({ departure_id: item.departure_id, ok: false, error: code })
    }
  }
  return results
}
/** عنوان التوقفات التي لم يرسل LVN عنواناً لها: تحويل عكسي من OpenStreetMap (Nominatim) — توقف واحد في الثانية احتراماً لشروط الخدمة */
async function geocodeStops(limit: number) {
  const { data, error } = await admin.rpc('trip_route_stops_without_address', { p_limit: limit })
  if (error) return { done: 0, error: error.code }
  const stops = (Array.isArray(data) ? data : []) as Array<{ id: number; latitude: number; longitude: number }>
  let done = 0
  for (const stop of stops) {
    try {
      const controller = new AbortController(),
        timer = setTimeout(() => controller.abort(), 8000)
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${stop.latitude}&lon=${stop.longitude}&zoom=16&accept-language=ar`,
        { headers: { 'User-Agent': 'AkaramPWA/1.0 (ops trip routes)' }, signal: controller.signal },
      ).finally(() => clearTimeout(timer))
      if (!res.ok) continue
      const body = (await res.json()) as { display_name?: string; address?: Record<string, string> }
      const a = body.address ?? {}
      const short = [a.road, a.neighbourhood ?? a.suburb ?? a.quarter, a.city ?? a.town ?? a.county].filter(Boolean).join(' / ')
      const text = short || body.display_name || ''
      if (!text) continue
      await admin.rpc('trip_route_stop_address_set', { p_stop: stop.id, p_address: text })
      done++
      await new Promise((r) => setTimeout(r, 1100))
    } catch {
      // عنوان اختياري — الفشل لا يوقف شيئاً
    }
  }
  return { done }
}

async function saveGeofences(providerId: string, value: unknown) {
  const root = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const geofences = jsonArray(root.geofences).filter(
    (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object',
  )
  const rows = geofences
    .map((item) => ({
      provider_id: providerId,
      external_id: String(item.id ?? ''),
      name: String(item.name ?? 'LVN Geofence').trim(),
      source: 'lvn',
      polygon: jsonArray(item.coordinates),
      color: String(item.polygon_color ?? '#2563eb'),
      is_active: !['0', 'false'].includes(String(item.active ?? '1').toLowerCase()),
      raw_data: item,
      updated_at: new Date().toISOString(),
    }))
    .filter((item) => item.external_id && item.name.length >= 2 && item.polygon.length >= 3)
  if (!rows.length) return 0
  const { error } = await admin
    .from('gps_geofences')
    .upsert(rows, { onConflict: 'provider_id,external_id' })
  if (error) throw new Error(`LVN_GEOFENCES_FAILED:${error.code ?? 'DB'}`)
  return rows.length
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req)
  if (cors) return cors
  if (req.method !== 'POST') return response({ error: 'METHOD_NOT_ALLOWED' }, 405)
  const user = await actor(req)
  if (!user) return response({ error: 'GPS_SYNC_FORBIDDEN' }, 403)
  let action: Action = 'incremental'
  try {
    const body = (await req.json().catch(() => ({}))) as SyncBody
    if (body.action && ['test', 'full', 'incremental', 'history', 'trips', 'trip', 'stops'].includes(body.action))
      action = body.action
    const { data: provider, error: providerError } = await admin
      .from('gps_providers')
      .select('id,sync_cursor')
      .eq('type', 'vendor_api')
      .eq('base_url', BASE)
      .eq('is_active', true)
      .maybeSingle()
    if (providerError || !provider) throw new Error('LVN_PROVIDER_NOT_CONFIGURED')
    if (action === 'history') {
      const hash = await login()
      return response(await importHistory(provider, user.id, hash, body))
    }
    if (action === 'stops') {
      const hash = await login()
      return response(await pullStopHistory(provider.id, hash, Math.min(Math.max(Number(body.limit) || 2, 1), 20)))
    }
    if (action === 'trips') {
      const hash = await login()
      const results = await processTripQueue(hash, Math.min(Math.max(Number(body.limit) || 5, 1), 20))
      const geocoded = await geocodeStops(10)
      return response({ ok: true, action, processed: results.length, results, geocoded: geocoded.done })
    }
    if (action === 'trip') {
      if (!body.departureId) throw new Error('TRIP_ROUTE_TARGET_INVALID')
      // يقدّم الانطلاقية في الطابور ثم يسحبها فوراً بالفترة الدقيقة التي يحددها الطابور
      const { error: reqError } = await admin.rpc('trip_route_request_pull', { p_departure: body.departureId })
      if (reqError) throw new Error(`TRIP_ROUTE_REQUEST_FAILED:${reqError.code ?? 'DB'}`)
      const { data: queue, error: qErr } = await admin.rpc('trip_route_pull_queue', { p_limit: 50 })
      if (qErr) throw new Error(`TRIP_ROUTE_QUEUE_FAILED:${qErr.code ?? 'DB'}`)
      const item = ((Array.isArray(queue) ? queue : []) as TripQueueItem[]).find((x) => x.departure_id === body.departureId)
      if (!item) throw new Error('TRIP_ROUTE_NOT_QUEUED')
      const hash = await login()
      try {
        const r = await pullTripRoute(hash, item)
        await geocodeStops(5)
        return response({ ok: true, action, departureId: item.departure_id, status: r.status, points: r.points_kept, final: item.final })
      } catch (e) {
        const code = safeError(e).split(':')[0]
        await admin.rpc('trip_route_mark_failed', { p_departure: item.departure_id, p_error: code })
        throw e
      }
    }
    const insertRun = () => admin
      .from('gps_sync_runs')
      .insert({
        provider_id: provider.id,
        sync_type: action === 'test' ? 'connection_test' : action,
        requested_by: user.id,
      })
      .select('id')
      .single()
    let { data: run, error: runError } = await insertRun()
    // 00368: سجل مزامنة «قيد التنفيذ» أقدم من 3 دقائق = تشغيل مات دون إغلاق (مهلة/انهيار) ⇒ يُغلق كفاشل ويُعاد الإدراج
    if (runError?.code === '23505') {
      const { data: stale } = await admin
        .from('gps_sync_runs')
        .update({ status: 'failed', finished_at: new Date().toISOString(), error_code: 'LVN_SYNC_STALE_RUN', error_message: 'LVN_SYNC_STALE_RUN' })
        .eq('provider_id', provider.id)
        .eq('status', 'running')
        .lt('started_at', new Date(Date.now() - STALE_RUN_MS).toISOString())
        .select('id')
      if (stale?.length) ({ data: run, error: runError } = await insertRun())
    }
    // 00366: التحديث الجزئي يُستدعى كل ثانية من الشاشة وكل دقيقة من المجدول؛ تصادمه مع مزامنة جارية ليس خطأ — يُتخطّى بهدوء (200) بدل 400 في كل ثانية
    if (runError?.code === '23505' && action === 'incremental')
      return response({ ok: true, action, skipped: true, reason: 'LVN_SYNC_ALREADY_RUNNING' })
    if (runError || !run)
      throw new Error(
        runError?.code === '23505' ? 'LVN_SYNC_ALREADY_RUNNING' : 'LVN_SYNC_RUN_CREATE_FAILED',
      )
    try {
      const hash = await login()
      if (action === 'test') {
        await admin
          .from('gps_sync_runs')
          .update({ status: 'success', finished_at: new Date().toISOString() })
          .eq('id', run.id)
        return response({ ok: true, action, message: 'تم الاتصال بخدمة LVN بنجاح' })
      }
      let pages = 0,
        received = 0,
        inserted = 0,
        updated = 0,
        cursor: string | null = provider.sync_cursor ?? null,
        version: string | null = null
      if (action === 'full') {
        const reportData = await request('/add_report_data', hash)
        await saveGeofences(provider.id, reportData)
        for (let page = 1; page <= 100; page++) {
          const groups = (await request('/get_devices', hash, {
            limit: '100',
            page: String(page),
          })) as Array<{ items?: unknown[] }>
          const items = Array.isArray(groups)
            ? groups.flatMap((group) => (Array.isArray(group.items) ? group.items : []))
            : []
          pages++
          const count = items.length
          if (count) {
            const result = await apply(provider.id, items, null, null, 'full')
            received += result.received
            inserted += result.inserted
            updated += result.updated
          }
          if (count < 100) break
          if (page === 100) throw new Error('LVN_PAGE_LIMIT_EXCEEDED')
        }
        const latest = (await request('/get_devices_latest', hash)) as LvnLatest
        cursor = latest.time == null ? null : String(latest.time)
        version = latest.version ?? null
        const latestItems = Array.isArray(latest.items) ? latest.items : []
        await saveEvents(provider.id, Array.isArray(latest.events) ? latest.events : [])
        if (latestItems.length) {
          const result = await apply(provider.id, latestItems, cursor, version, 'incremental')
          received += result.received
          inserted += result.inserted
          updated += result.updated
        } else
          await admin
            .from('gps_providers')
            .update({
              sync_cursor: cursor,
              api_version: version,
              last_success_at: new Date().toISOString(),
              last_full_sync_at: new Date().toISOString(),
              last_error_code: null,
            })
            .eq('id', provider.id)
      } else {
        if (!cursor) throw new Error('LVN_FULL_SYNC_REQUIRED')
        let latest: LvnLatest
        try {
          latest = (await request('/get_devices_latest', hash, { time: cursor })) as LvnLatest
        } catch (error) {
          if (safeError(error) === 'LVN_UNAUTHORIZED') {
            const fresh = await login()
            latest = (await request('/get_devices_latest', fresh, { time: cursor })) as LvnLatest
          } else throw error
        }
        const items = Array.isArray(latest.items) ? latest.items : []
        await saveEvents(provider.id, Array.isArray(latest.events) ? latest.events : [])
        const result = await apply(
          provider.id,
          items,
          latest.time == null ? cursor : String(latest.time),
          latest.version ?? null,
          'incremental',
        )
        received = result.received
        inserted = result.inserted
        updated = result.updated
        pages = 1
        cursor = latest.time == null ? cursor : String(latest.time)
      }
      const { error: alertError } = await admin.rpc('gps_evaluate_operational_alerts')
      if (alertError && alertError.code !== 'PGRST202')
        throw new Error(`LVN_ALERTS_FAILED:${alertError.code ?? 'DB'}`)
      // 00342: مع كل دورة مزامنة (كل دقيقة من المجدول) تُسحب حتى 3 انطلاقيات مستحقة من طابور المسارات — فشلها لا يُفشل المزامنة
      if (action === 'incremental') {
        try { await processTripQueue(hash, 3) } catch { /* يُسجَّل في trip_routes.error_code لكل انطلاقية */ }
      }
      if (action === 'full')
        await admin
          .from('gps_providers')
          .update({
            last_full_sync_at: new Date().toISOString(),
            last_success_at: new Date().toISOString(),
            last_error_code: null,
          })
          .eq('id', provider.id)
      await admin
        .from('gps_sync_runs')
        .update({
          status: 'success',
          finished_at: new Date().toISOString(),
          pages_count: pages,
          received_count: received,
          inserted_count: inserted,
          updated_count: updated,
        })
        .eq('id', run.id)
      // 00366: المجدول الخادمي (service-role) يسحب دفعة من طابور بقع التوقف (جهازان × ≤ 6 ساعات) — بعد إغلاق سجل المزامنة
      // كي لا يحتجز قفل المزامنة دقائق ويُفشل التحديث الجزئي من الشاشة (LVN_SYNC_ALREADY_RUNNING)
      let stops: unknown = null
      if (action === 'incremental' && (user as { scheduler?: boolean }).scheduler) {
        try { stops = await pullStopHistory(provider.id, hash, 2) } catch { /* يُسجَّل في gps_stop_scan_state.lvn_last_error لكل جهاز */ }
      }
      return response({
        ok: true,
        action,
        stops,
        pages,
        received,
        inserted,
        updated,
        cursorSaved: Boolean(cursor),
      })
    } catch (error) {
      const code = safeError(error).split(':')[0]
      await admin
        .from('gps_sync_runs')
        .update({
          status: 'failed',
          finished_at: new Date().toISOString(),
          error_code: code,
          error_message: code,
        })
        .eq('id', run.id)
      await admin
        .from('gps_providers')
        .update({ last_error_at: new Date().toISOString(), last_error_code: code })
        .eq('id', provider.id)
      throw error
    }
  } catch (error) {
    const code = safeError(error).split(':')[0]
    return response(
      { error: code },
      code === 'LVN_CONFIG_MISSING' ? 503 : code === 'LVN_LOGIN_REJECTED' ? 401 : 400,
    )
  }
})
