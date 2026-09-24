/**
 * مزوّدو البصمة القابلون للتوصيل — منطق نقي (بلا Deno/شبكة) قابل للاختبار بالكامل.
 *
 * كل نمط سحب يُترجم استجابة مصدره إلى «بصمة موحّدة» NormalizedPunch ثم تُرسل دفعةً واحدة
 * إلى RPC biometric_import_punches (00139) التي تتكفّل بالتكرار/المطابقة/سجل العمليات.
 *
 * الأنماط:
 *   app_api_pull  — API تطبيق مشترك (عقد موثق: GET {base_url}{path}?from&to ، ترويسة X-API-Key،
 *                   الاستجابة { records: [{ pin, at, direction?, name?, device_serial? }] } أو مصفوفة مباشرة).
 *   lan_pull      — جهاز/خدمة على الشبكة الداخلية بصيغة ZKTeco JSON ({ data: [{ user_id|pin, timestamp,
 *                   punch|status, ... }] }) أو نص ATTLOG خام (سطر لكل بصمة).
 *   generic_pull  — أي JSON مع خريطة حقول قابلة للتهيئة (mapping) + مسار المصفوفة (records_path).
 *   adms_push     — لا سحب (الجهاز يدفع إلينا) — يُرفض هنا بوضوح.
 *   zk_bridge     — لا سحب من الخادم (وكيل داخل الشبكة يرسل عبر biometric-bridge) — يُرفض هنا أيضاً.
 */

export type PullMode = 'app_api_pull' | 'lan_pull' | 'generic_pull'
export type BiometricMode = PullMode | 'adms_push' | 'zk_bridge'
export type PunchDirection = 'in' | 'out' | 'unknown'

export interface NormalizedPunch {
  pin: string
  at: string          // ISO 8601
  direction: PunchDirection
  name?: string
  device_serial?: string
}

export interface DeviceConfig {
  base_url: string
  path?: string
  api_key?: string
  api_key_header?: string          // افتراضي X-API-Key
  auth_bearer?: string
  basic_user?: string
  basic_pass?: string
  query?: Record<string, string>   // معاملات ثابتة إضافية
  from_param?: string              // اسم معامل البداية (افتراضي from)
  to_param?: string                // اسم معامل النهاية (افتراضي to)
  timezone_offset?: string         // مثل +03:00 — لأوقات المصدر بلا منطقة
  records_path?: string            // generic: مسار المصفوفة داخل JSON مثل data.items
  mapping?: FieldMapping           // generic: خريطة الحقول
  in_values?: string[]             // القيم التي تعني «دخول»
  out_values?: string[]            // القيم التي تعني «خروج»
}

export interface FieldMapping {
  pin: string
  at: string
  direction?: string
  name?: string
  device_serial?: string
  date?: string                    // إن كان التاريخ والوقت منفصلين
  time?: string
}

export interface PullRequest {
  url: string
  headers: Record<string, string>
}

export class BiometricProviderError extends Error {
  constructor(public code: string, detail?: string) {
    super(detail ? `${code}: ${detail}` : code)
    this.name = 'BiometricProviderError'
  }
}

const DEFAULT_PATHS: Record<PullMode, string> = {
  app_api_pull: '/attendance/logs',
  lan_pull: '/api/attlog',
  generic_pull: '/',
}
const DEFAULT_IN = ['0', 'in', 'checkin', 'check-in', 'check_in', 'i', 'entry', 'دخول', 'حضور']
const DEFAULT_OUT = ['1', 'out', 'checkout', 'check-out', 'check_out', 'o', 'exit', 'خروج', 'انصراف']

export function isPullMode(mode: string): mode is PullMode {
  return mode === 'app_api_pull' || mode === 'lan_pull' || mode === 'generic_pull'
}

/** تحقق التهيئة قبل أي اتصال — رسائل خطأ مرمّزة ثابتة */
export function validateConfig(mode: BiometricMode, config: unknown): DeviceConfig {
  if (!isPullMode(mode)) throw new BiometricProviderError('BIO_MODE_NOT_PULLABLE', mode)
  const c = (config ?? {}) as Partial<DeviceConfig>
  const base = typeof c.base_url === 'string' ? c.base_url.trim() : ''
  if (!base) throw new BiometricProviderError('BIO_CONFIG_BASE_URL')
  let parsed: URL
  try {
    parsed = new URL(base)
  } catch {
    throw new BiometricProviderError('BIO_CONFIG_BASE_URL', base)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new BiometricProviderError('BIO_CONFIG_BASE_URL', parsed.protocol)
  }
  if (mode === 'generic_pull') {
    const m = c.mapping
    if (!m || typeof m !== 'object' || !m.pin || (!m.at && !(m.date && m.time))) {
      throw new BiometricProviderError('BIO_CONFIG_MAPPING')
    }
  }
  return { ...c, base_url: base.replace(/\/+$/, '') }
}

/** بناء طلب السحب (رابط + ترويسات) — بلا تنفيذ */
export function buildPullRequest(
  mode: PullMode, config: DeviceConfig, fromIso: string, toIso: string,
): PullRequest {
  const path = (config.path ?? DEFAULT_PATHS[mode]).trim()
  const url = new URL(config.base_url + (path.startsWith('/') ? path : `/${path}`))
  url.searchParams.set(config.from_param ?? 'from', fromIso)
  url.searchParams.set(config.to_param ?? 'to', toIso)
  for (const [k, v] of Object.entries(config.query ?? {})) url.searchParams.set(k, v)

  const headers: Record<string, string> = { Accept: 'application/json, text/plain' }
  if (config.api_key) headers[config.api_key_header ?? 'X-API-Key'] = config.api_key
  if (config.auth_bearer) headers.Authorization = `Bearer ${config.auth_bearer}`
  else if (config.basic_user) headers.Authorization = `Basic ${btoa(`${config.basic_user}:${config.basic_pass ?? ''}`)}`
  return { url: url.toString(), headers }
}

/** تطبيع الاستجابة الخام (JSON أو نص) حسب النمط إلى بصمات موحّدة */
export function normalizeResponse(mode: PullMode, config: DeviceConfig, body: unknown): NormalizedPunch[] {
  switch (mode) {
    case 'app_api_pull': return normalizeAppApi(config, body)
    case 'lan_pull': return normalizeLan(config, body)
    case 'generic_pull': return normalizeGeneric(config, body)
  }
}

// ─────────── app_api_pull: العقد الموثق ───────────
function normalizeAppApi(config: DeviceConfig, body: unknown): NormalizedPunch[] {
  const rows = extractArray(body, ['records', 'data', 'items', 'logs', 'result'])
  return rows.map((row, i) => {
    const r = asRecord(row, i)
    return finalize({
      pin: pick(r, ['pin', 'employee_number', 'employee_id', 'user_id', 'badge']),
      at: pick(r, ['at', 'timestamp', 'punched_at', 'time', 'datetime']),
      direction: pick(r, ['direction', 'type', 'status', 'punch']),
      name: pick(r, ['name', 'employee_name', 'full_name']),
      device_serial: pick(r, ['device_serial', 'device_sn', 'sn', 'device']),
    }, config, i)
  })
}

// ─────────── lan_pull: ZKTeco JSON أو ATTLOG خام ───────────
function normalizeLan(config: DeviceConfig, body: unknown): NormalizedPunch[] {
  if (typeof body === 'string') return parseAttlogText(body, config)
  const rows = extractArray(body, ['data', 'records', 'attlog', 'logs', 'result'])
  return rows.map((row, i) => {
    const r = asRecord(row, i)
    return finalize({
      pin: pick(r, ['pin', 'user_id', 'userid', 'uid', 'enroll_number', 'PIN']),
      at: pick(r, ['timestamp', 'time', 'at', 'datetime', 'punch_time', 'checktime']),
      direction: pick(r, ['punch', 'status', 'state', 'direction', 'checktype']),
      name: pick(r, ['name', 'user_name']),
      device_serial: pick(r, ['sn', 'device_sn', 'serial']),
    }, config, i)
  })
}

/** نص ATTLOG: PIN<tab|space>YYYY-MM-DD HH:MM:SS<sep>status<sep>verify… — السطر المشوّه يُتجاوَز */
export function parseAttlogText(text: string, config: DeviceConfig = { base_url: 'http://x' }): NormalizedPunch[] {
  const out: NormalizedPunch[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const parts = line.split(/[\t\s]+/)
    if (parts.length < 3) continue
    const pin = parts[0] ?? ''
    const at = toIso(`${parts[1]} ${parts[2]}`, config.timezone_offset)
    if (!pin || !at) continue
    out.push({ pin, at, direction: toDirection(parts[3], config) })
  }
  return out
}

// ─────────── generic_pull: خريطة حقول ───────────
function normalizeGeneric(config: DeviceConfig, body: unknown): NormalizedPunch[] {
  const m = config.mapping as FieldMapping
  const rows = config.records_path
    ? extractArray(getPath(body, config.records_path), [])
    : extractArray(body, ['records', 'data', 'items', 'logs', 'result'])
  return rows.map((row, i) => {
    const r = asRecord(row, i)
    const at = m.at ? getPath(r, m.at) : joinDateTime(getPath(r, m.date!), getPath(r, m.time!))
    return finalize({
      pin: getPath(r, m.pin),
      at,
      direction: m.direction ? getPath(r, m.direction) : undefined,
      name: m.name ? getPath(r, m.name) : undefined,
      device_serial: m.device_serial ? getPath(r, m.device_serial) : undefined,
    }, config, i)
  })
}

// ─────────── أدوات مشتركة ───────────
function extractArray(body: unknown, keys: string[]): unknown[] {
  if (Array.isArray(body)) return body
  if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>
    for (const k of keys) if (Array.isArray(o[k])) return o[k] as unknown[]
    // ZKTeco بعض الإصدارات: { data: { records: [...] } }
    for (const k of keys) {
      const inner = o[k]
      if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
        const found = extractArray(inner, keys)
        if (found.length || Object.keys(inner as object).some((kk) => keys.includes(kk))) return found
      }
    }
  }
  throw new BiometricProviderError('BIO_RESPONSE_SHAPE')
}

function asRecord(row: unknown, i: number): Record<string, unknown> {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new BiometricProviderError('BIO_RECORD_INVALID', `#${i}`)
  }
  return row as Record<string, unknown>
}

function pick(r: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) if (r[k] !== undefined && r[k] !== null && r[k] !== '') return r[k]
  return undefined
}

export function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key]
    return undefined
  }, obj)
}

function joinDateTime(d: unknown, t: unknown): string | undefined {
  if (d === undefined || d === null || t === undefined || t === null) return undefined
  return `${String(d).trim()} ${String(t).trim()}`
}

interface RawPunch { pin: unknown; at: unknown; direction: unknown; name: unknown; device_serial: unknown }

function finalize(raw: RawPunch, config: DeviceConfig, i: number): NormalizedPunch {
  const pin = raw.pin === undefined || raw.pin === null ? '' : String(raw.pin).trim()
  if (!pin) throw new BiometricProviderError('BIO_RECORD_PIN', `#${i}`)
  const at = toIso(raw.at, config.timezone_offset)
  if (!at) throw new BiometricProviderError('BIO_RECORD_TIME', `#${i}`)
  const p: NormalizedPunch = { pin, at, direction: toDirection(raw.direction, config) }
  if (raw.name !== undefined && raw.name !== null && String(raw.name).trim()) p.name = String(raw.name).trim()
  if (raw.device_serial !== undefined && raw.device_serial !== null && String(raw.device_serial).trim()) {
    p.device_serial = String(raw.device_serial).trim()
  }
  return p
}

/** يحوّل قيمة زمنية (ISO، «YYYY-MM-DD HH:MM:SS»، epoch ثوانٍ/ملّي) إلى ISO؛ null إن فسدت */
export function toIso(value: unknown, tzOffset?: string): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  let s = String(value).trim()
  if (!s) return null
  if (/^\d{10}(\.\d+)?$/.test(s) || /^\d{13}$/.test(s)) return toIso(Number(s), tzOffset)
  // «YYYY-MM-DD HH:MM[:SS]» بلا منطقة → أضف منطقة المصدر (أو اعتبرها UTC إن لم تُحدَّد)
  const naive = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(:\d{2})?)$/.exec(s)
  if (naive) s = `${naive[1]}T${naive[2]}${naive[3] ? '' : ':00'}${normalizeOffset(tzOffset)}`
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function normalizeOffset(tz?: string): string {
  if (!tz) return 'Z'
  const m = /^([+-])(\d{1,2}):?(\d{2})?$/.exec(tz.trim())
  if (!m) return 'Z'
  return `${m[1]}${(m[2] ?? '0').padStart(2, '0')}:${m[3] ?? '00'}`
}

export function toDirection(value: unknown, config: DeviceConfig = { base_url: 'http://x' }): PunchDirection {
  if (value === undefined || value === null) return 'unknown'
  const v = String(value).trim().toLowerCase()
  if (!v) return 'unknown'
  const ins = (config.in_values ?? DEFAULT_IN).map((x) => x.toLowerCase())
  const outs = (config.out_values ?? DEFAULT_OUT).map((x) => x.toLowerCase())
  if (ins.includes(v)) return 'in'
  if (outs.includes(v)) return 'out'
  return 'unknown'
}

/** إزالة التكرارات داخل الدفعة نفسها (المصدر قد يكرر) قبل الإرسال */
export function dedupePunches(punches: NormalizedPunch[]): NormalizedPunch[] {
  const seen = new Set<string>()
  const out: NormalizedPunch[] = []
  for (const p of punches) {
    const key = `${p.device_serial ?? ''}|${p.pin}|${p.at}|${p.direction}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
  }
  return out
}

/** نافذة السحب: افتراضياً آخر 7 أيام حتى الآن؛ حد أقصى 92 يوماً؛ from<to إلزامي */
export function resolveWindow(from?: string | null, to?: string | null, now: Date = new Date()): { fromIso: string; toIso: string } {
  const toDate = to ? new Date(to) : now
  const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 7 * 86400000)
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw new BiometricProviderError('BIO_WINDOW_INVALID')
  }
  if (fromDate >= toDate) throw new BiometricProviderError('BIO_WINDOW_INVALID', 'from>=to')
  if (toDate.getTime() - fromDate.getTime() > 92 * 86400000) {
    throw new BiometricProviderError('BIO_WINDOW_TOO_LARGE')
  }
  return { fromIso: fromDate.toISOString(), toIso: toDate.toISOString() }
}
