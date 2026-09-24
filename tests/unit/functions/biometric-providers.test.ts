import { describe, expect, it } from 'vitest'
import {
  BiometricProviderError, buildPullRequest, dedupePunches, getPath, isPullMode, normalizeResponse,
  parseAttlogText, resolveWindow, toDirection, toIso, validateConfig,
} from '../../../supabase/functions/_shared/biometric-providers'

const base = { base_url: 'https://vendor.example/api/' }

describe('البصمة · التهيئة والأنماط القابلة للتوصيل', () => {
  it('يميّز أنماط السحب عن نمط الدفع ADMS', () => {
    expect(isPullMode('app_api_pull')).toBe(true)
    expect(isPullMode('lan_pull')).toBe(true)
    expect(isPullMode('generic_pull')).toBe(true)
    expect(isPullMode('adms_push')).toBe(false)
    expect(() => validateConfig('adms_push', base)).toThrow('BIO_MODE_NOT_PULLABLE')
  })
  it('يرفض تهيئة بلا رابط أو برابط غير http(s) ويزيل الشرطة الختامية', () => {
    expect(() => validateConfig('app_api_pull', {})).toThrow('BIO_CONFIG_BASE_URL')
    expect(() => validateConfig('app_api_pull', { base_url: 'ftp://x' })).toThrow('BIO_CONFIG_BASE_URL')
    expect(() => validateConfig('app_api_pull', { base_url: 'not a url' })).toThrow('BIO_CONFIG_BASE_URL')
    expect(validateConfig('app_api_pull', base).base_url).toBe('https://vendor.example/api')
  })
  it('النمط العام يشترط خريطة حقول (pin + at أو date+time)', () => {
    expect(() => validateConfig('generic_pull', base)).toThrow('BIO_CONFIG_MAPPING')
    expect(() => validateConfig('generic_pull', { ...base, mapping: { pin: 'id' } })).toThrow('BIO_CONFIG_MAPPING')
    expect(validateConfig('generic_pull', { ...base, mapping: { pin: 'id', date: 'd', time: 't' } }).mapping).toBeTruthy()
  })
})

describe('البصمة · بناء طلب السحب', () => {
  it('الطريقة 1 (API تطبيق): المسار الافتراضي + نافذة + مفتاح API في الترويسة', () => {
    const cfg = validateConfig('app_api_pull', { ...base, api_key: 'K1' })
    const r = buildPullRequest('app_api_pull', cfg, '2026-09-01T00:00:00.000Z', '2026-09-02T00:00:00.000Z')
    const u = new URL(r.url)
    expect(u.pathname).toBe('/api/attendance/logs')
    expect(u.searchParams.get('from')).toBe('2026-09-01T00:00:00.000Z')
    expect(u.searchParams.get('to')).toBe('2026-09-02T00:00:00.000Z')
    expect(r.headers['X-API-Key']).toBe('K1')
    expect(r.url).not.toContain('K1')
  })
  it('يدعم مسار/معاملات مخصصة وترويسة مفتاح مخصصة وBearer وBasic', () => {
    const bearer = buildPullRequest('lan_pull', validateConfig('lan_pull', {
      base_url: 'http://192.168.1.50', path: 'cgi-bin/attlog', from_param: 'start', to_param: 'end',
      query: { format: 'json' }, auth_bearer: 'T', api_key: 'K', api_key_header: 'X-Device-Key',
    }), 'A', 'B')
    const u = new URL(bearer.url)
    expect(u.pathname).toBe('/cgi-bin/attlog')
    expect(u.searchParams.get('start')).toBe('A')
    expect(u.searchParams.get('end')).toBe('B')
    expect(u.searchParams.get('format')).toBe('json')
    expect(bearer.headers.Authorization).toBe('Bearer T')
    expect(bearer.headers['X-Device-Key']).toBe('K')
    const basic = buildPullRequest('lan_pull', validateConfig('lan_pull', { base_url: 'http://d', basic_user: 'admin', basic_pass: '1234' }), 'A', 'B')
    expect(basic.headers.Authorization).toBe(`Basic ${btoa('admin:1234')}`)
  })
})

describe('البصمة · الطريقة 1: تطبيع استجابة API التطبيق المشترك', () => {
  it('عقد موثق { records: [...] } → بصمات موحّدة مع الاتجاه والاسم والجهاز', () => {
    const out = normalizeResponse('app_api_pull', validateConfig('app_api_pull', base), {
      records: [
        { pin: '7001', at: '2026-09-20T08:02:00+03:00', direction: 'in', name: 'أحمد', device_serial: 'D1' },
        { employee_number: 7002, timestamp: '2026-09-20 15:31:00', type: 'OUT' },
        { badge: '7003', time: 1758344400, status: 'weird' },
      ],
    })
    expect(out).toHaveLength(3)
    expect(out[0]).toEqual({ pin: '7001', at: '2026-09-20T05:02:00.000Z', direction: 'in', name: 'أحمد', device_serial: 'D1' })
    expect(out[1]).toEqual({ pin: '7002', at: '2026-09-20T15:31:00.000Z', direction: 'out' })
    expect(out[2]?.direction).toBe('unknown')
    expect(out[2]?.at).toBe(new Date(1758344400 * 1000).toISOString())
  })
  it('يقبل مصفوفة مباشرة ومفاتيح بديلة (data/items) ويرفض شكلاً غير معروف', () => {
    const cfg = validateConfig('app_api_pull', base)
    expect(normalizeResponse('app_api_pull', cfg, [{ pin: '1', at: '2026-01-01T00:00:00Z' }])).toHaveLength(1)
    expect(normalizeResponse('app_api_pull', cfg, { data: { items: [{ pin: '1', at: '2026-01-01T00:00:00Z' }] } })).toHaveLength(1)
    expect(() => normalizeResponse('app_api_pull', cfg, { hello: 1 })).toThrow('BIO_RESPONSE_SHAPE')
    expect(() => normalizeResponse('app_api_pull', cfg, 'text')).toThrow('BIO_RESPONSE_SHAPE')
  })
  it('سجل بلا PIN أو بوقت فاسد = خطأ مرمّز يذكر رقم السجل', () => {
    const cfg = validateConfig('app_api_pull', base)
    expect(() => normalizeResponse('app_api_pull', cfg, [{ at: '2026-01-01T00:00:00Z' }])).toThrow('BIO_RECORD_PIN: #0')
    expect(() => normalizeResponse('app_api_pull', cfg, [{ pin: '1', at: 'x' }])).toThrow('BIO_RECORD_TIME: #0')
    expect(() => normalizeResponse('app_api_pull', cfg, [1])).toThrow('BIO_RECORD_INVALID: #0')
  })
  it('الأوقات بلا منطقة تُفسَّر بمنطقة المصدر المهيّأة (+03:00 بغداد)', () => {
    const cfg = validateConfig('app_api_pull', { ...base, timezone_offset: '+03:00' })
    const [p] = normalizeResponse('app_api_pull', cfg, [{ pin: '1', at: '2026-09-20 08:00' }])
    expect(p?.at).toBe('2026-09-20T05:00:00.000Z')
  })
})

describe('البصمة · الطريقة 2: الشبكة الداخلية (ZKTeco JSON / ATTLOG خام)', () => {
  it('ZKTeco JSON: user_id/timestamp/punch → موحّد', () => {
    const cfg = validateConfig('lan_pull', { base_url: 'http://192.168.1.50', timezone_offset: '+03:00' })
    const out = normalizeResponse('lan_pull', cfg, {
      data: [
        { user_id: 7001, timestamp: '2026-09-20 08:00:00', punch: 0, sn: 'ZK1' },
        { uid: '7001', checktime: '2026-09-20 16:00:00', checktype: 1 },
      ],
    })
    expect(out[0]).toEqual({ pin: '7001', at: '2026-09-20T05:00:00.000Z', direction: 'in', device_serial: 'ZK1' })
    expect(out[1]).toEqual({ pin: '7001', at: '2026-09-20T13:00:00.000Z', direction: 'out' })
  })
  it('نص ATTLOG خام: سطر لكل بصمة، المشوّه يُتجاوَز بدل إسقاط الدفعة', () => {
    const text = '7001\t2026-09-20 08:00:00\t0\t1\n\ngarbage\n7002 2026-09-20 15:05:00 1 15\n7003 2026-09-20 bad 1 1\n'
    const out = parseAttlogText(text, { base_url: 'http://x', timezone_offset: '+03:00' })
    expect(out).toEqual([
      { pin: '7001', at: '2026-09-20T05:00:00.000Z', direction: 'in' },
      { pin: '7002', at: '2026-09-20T12:05:00.000Z', direction: 'out' },
    ])
    expect(normalizeResponse('lan_pull', validateConfig('lan_pull', { base_url: 'http://x' }), text)).toHaveLength(2)
  })
})

describe('البصمة · النمط العام بخريطة حقول', () => {
  it('records_path متداخل + date/time منفصلان + قيم اتجاه مخصصة', () => {
    const cfg = validateConfig('generic_pull', {
      base_url: 'https://other.example', records_path: 'payload.rows',
      mapping: { pin: 'emp.code', date: 'd', time: 't', direction: 'kind', name: 'emp.name' },
      in_values: ['ENTER'], out_values: ['LEAVE'], timezone_offset: '+03:00',
    })
    const out = normalizeResponse('generic_pull', cfg, {
      payload: { rows: [
        { emp: { code: 'A1', name: 'علي' }, d: '2026-09-20', t: '08:00:00', kind: 'ENTER' },
        { emp: { code: 'A1' }, d: '2026-09-20', t: '16:00:00', kind: 'LEAVE' },
        { emp: { code: 'A2' }, d: '2026-09-20', t: '09:00:00', kind: 'in' },
      ] },
    })
    expect(out[0]).toEqual({ pin: 'A1', at: '2026-09-20T05:00:00.000Z', direction: 'in', name: 'علي' })
    expect(out[1]?.direction).toBe('out')
    expect(out[2]?.direction).toBe('unknown') // «in» ليست ضمن القيم المخصصة
  })
  it('getPath يعيد undefined بأمان لمسار غير موجود', () => {
    expect(getPath({ a: { b: 1 } }, 'a.b')).toBe(1)
    expect(getPath({ a: 1 }, 'a.b.c')).toBeUndefined()
    expect(getPath(null, 'a')).toBeUndefined()
  })
})

describe('البصمة · أدوات: الوقت والاتجاه والتكرار والنافذة', () => {
  it('toIso: ISO، بلا منطقة، epoch ثوانٍ/ملّي، نصوص رقمية، فاسد', () => {
    expect(toIso('2026-09-20T08:00:00Z')).toBe('2026-09-20T08:00:00.000Z')
    expect(toIso('2026-09-20 08:00:00')).toBe('2026-09-20T08:00:00.000Z')
    expect(toIso('2026-09-20 08:00:00', '+3')).toBe('2026-09-20T05:00:00.000Z')
    expect(toIso('2026-09-20 08:00:00', '+0300')).toBe('2026-09-20T05:00:00.000Z')
    expect(toIso(1789891200)).toBe('2026-09-20T08:00:00.000Z')
    expect(toIso(1789891200000)).toBe('2026-09-20T08:00:00.000Z')
    expect(toIso('1789891200')).toBe('2026-09-20T08:00:00.000Z')
    expect(toIso('nope')).toBeNull()
    expect(toIso('')).toBeNull()
    expect(toIso(null)).toBeNull()
  })
  it('toDirection: القيم الافتراضية (رقمية/إنجليزية/عربية) وغير المعروف = unknown', () => {
    expect(toDirection(0)).toBe('in')
    expect(toDirection('1')).toBe('out')
    expect(toDirection('Check-In')).toBe('in')
    expect(toDirection('خروج')).toBe('out')
    expect(toDirection('حضور')).toBe('in')
    expect(toDirection('4')).toBe('unknown')
    expect(toDirection(undefined)).toBe('unknown')
  })
  it('dedupePunches يزيل المكرر داخل الدفعة بمفتاح (جهاز، PIN، وقت، اتجاه)', () => {
    const p = { pin: '1', at: '2026-01-01T00:00:00.000Z', direction: 'in' as const }
    expect(dedupePunches([p, { ...p }, { ...p, direction: 'out' }, { ...p, device_serial: 'X' }])).toHaveLength(3)
  })
  it('resolveWindow: افتراضي 7 أيام، رفض from>=to أو أكثر من 92 يوماً أو تاريخ فاسد', () => {
    const now = new Date('2026-09-24T10:00:00Z')
    expect(resolveWindow(undefined, undefined, now)).toEqual({ fromIso: '2026-09-17T10:00:00.000Z', toIso: '2026-09-24T10:00:00.000Z' })
    expect(resolveWindow('2026-09-01', '2026-09-02', now).fromIso).toBe('2026-09-01T00:00:00.000Z')
    expect(() => resolveWindow('2026-09-02', '2026-09-01', now)).toThrow('BIO_WINDOW_INVALID')
    expect(() => resolveWindow('2026-01-01', '2026-09-01', now)).toThrow('BIO_WINDOW_TOO_LARGE')
    expect(() => resolveWindow('bad', undefined, now)).toThrow('BIO_WINDOW_INVALID')
  })
  it('أخطاء المزوّد تحمل رمزاً ثابتاً قابلاً للترجمة في الواجهة', () => {
    const e = new BiometricProviderError('BIO_X', 'detail')
    expect(e.code).toBe('BIO_X')
    expect(e.message).toBe('BIO_X: detail')
    expect(e).toBeInstanceOf(Error)
  })
})
