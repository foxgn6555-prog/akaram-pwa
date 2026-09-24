/**
 * عقد جسر الشبكة الداخلية (zk_bridge): التحقق من الحمولة، تحويل سجلات node-zklib، الترشيح التزايدي،
 * وتطابق نسخة الوكيل (tools/zk-bridge/lib/*.mjs) مع النسخة المشتركة في Edge.
 */
import { describe, expect, it } from 'vitest'
import * as ts from '../../../supabase/functions/_shared/bridge-protocol'
// @ts-expect-error — وحدة JS بلا أنواع (وكيل Node)
import * as mjs from '../../../tools/zk-bridge/lib/bridge-protocol.mjs'
// @ts-expect-error — وحدة JS بلا أنواع (وكيل Node)
import { cycle, validateConfig } from '../../../tools/zk-bridge/bridge.mjs'

const impls: Array<[string, typeof ts]> = [['edge/ts', ts], ['agent/mjs', mjs as typeof ts]]

describe.each(impls)('bridge-protocol (%s)', (_name, P) => {
  it('validateBridgeBody: يقبل الحمولة الصحيحة ويطبّع الاتجاه والمستخدمين', () => {
    const b = P.validateBridgeBody({
      punches: [{ pin: ' 7 ', local: '2026-09-24 08:00:00' }, { pin: '8', local: '2026-09-24 09:00:00', direction: 'out' }, { pin: '9', local: '2026-09-24 10:00:00', direction: 'weird' }],
      users: [{ pin: '7', name: ' ليث ', card: 0, privilege: '14' }, { pin: 'bad pin!' }, { pin: '8', card: '123' }],
      agent: 'x',
    })
    expect(b.punches).toEqual([
      { pin: '7', local: '2026-09-24 08:00:00', direction: 'unknown' },
      { pin: '8', local: '2026-09-24 09:00:00', direction: 'out' },
      { pin: '9', local: '2026-09-24 10:00:00', direction: 'unknown' },
    ])
    expect(b.users).toEqual([{ pin: '7', name: 'ليث', card: undefined, privilege: 14 }, { pin: '8', name: undefined, card: '123', privilege: undefined }])
    expect(b.error).toBeUndefined()
  })

  it('validateBridgeBody: يرفض الحمولة الفاسدة برموز واضحة', () => {
    expect(() => P.validateBridgeBody(null)).toThrow(/BRIDGE_BODY_INVALID/)
    expect(() => P.validateBridgeBody({})).toThrow(/BRIDGE_PUNCHES_MISSING/)
    expect(() => P.validateBridgeBody({ punches: [{ pin: '', local: '2026-09-24 08:00:00' }] })).toThrow(/BRIDGE_PIN_INVALID/)
    expect(() => P.validateBridgeBody({ punches: [{ pin: '7', local: '2026-09-24T08:00:00Z' }] })).toThrow(/BRIDGE_TIME_INVALID/)
    expect(() => P.validateBridgeBody({ punches: Array.from({ length: P.BRIDGE_MAX_PUNCHES + 1 }, () => ({ pin: '1', local: '2026-09-24 08:00:00' })) })).toThrow(/BRIDGE_TOO_MANY/)
  })

  it('validateBridgeBody: تقرير فشل بلا بصمات مقبول', () => {
    const b = P.validateBridgeBody({ error: '  ETIMEDOUT 192.168.1.201:4370 ' })
    expect(b.punches).toEqual([])
    expect(b.error).toBe('ETIMEDOUT 192.168.1.201:4370')
  })

  it('mapZkAttendance: سجل node-zklib → بصمة بوقت الجهاز المحلي (بلا اعتماد على منطقة الحاسوب)', () => {
    // node-zklib يبني Date من حقول الجهاز بالتوقيت المحلي للحاسوب؛ نعيد الحقول نفسها نصاً
    const rec = { userSn: 12, deviceUserId: '7', recordTime: new Date(2026, 8, 24, 8, 5, 9), ip: '192.168.1.201' }
    expect(P.mapZkAttendance(rec)).toEqual({ pin: '7', local: '2026-09-24 08:05:09', direction: 'unknown', uid: 12 })
    expect(P.mapZkAttendance({ deviceUserId: '', recordTime: new Date() })).toBeNull()
    expect(P.mapZkAttendance({ deviceUserId: '7', recordTime: new Date(1999, 0, 1) })).toBeNull()
    expect(P.mapZkAttendance({ deviceUserId: '7', recordTime: 'garbage' })).toBeNull()
  })

  it('mapZkUser: مستخدم node-zklib → مستخدم الجسر (بطاقة 0 = بلا بطاقة)', () => {
    expect(P.mapZkUser({ role: 14, name: 'سارة', cardno: 0, userId: '55' })).toEqual({ pin: '55', name: 'سارة', card: undefined, privilege: 14 })
    expect(P.mapZkUser({ role: 0, name: '', cardno: 987, userId: '56' })).toEqual({ pin: '56', name: undefined, card: '987', privilege: 0 })
    expect(P.mapZkUser({ userId: '' })).toBeNull()
  })

  it('sinceFilter/maxLocal: ترشيح تزايدي بهامش 24 ساعة (الخادم يزيل التكرار)', () => {
    const ps = [
      { pin: '1', local: '2026-09-20 08:00:00' }, { pin: '1', local: '2026-09-23 09:00:00' }, { pin: '1', local: '2026-09-24 08:00:00' },
    ]
    expect(P.maxLocal(ps)).toBe('2026-09-24 08:00:00')
    expect(P.sinceFilter(ps, '2026-09-24 08:00:00').map((p) => p.local)).toEqual(['2026-09-23 09:00:00', '2026-09-24 08:00:00'])
    expect(P.sinceFilter(ps, null)).toHaveLength(3)
    expect(P.sinceFilter(ps, 'bad')).toHaveLength(3)
    expect(P.maxLocal([])).toBeNull()
  })
})

describe('zk-bridge agent (cycle بلا جهاز حقيقي)', () => {
  const cfg = validateConfig({
    supabase_url: 'https://x.supabase.co/',
    devices: [{ serial: 'ZK-001', ip: '192.168.1.201', bridge_key: 'zkb_' + 'a'.repeat(48) }],
  })

  it('validateConfig: افتراضيات المنفذ/المفتاح/الفاصل ورفض المفاتيح غير الصالحة', () => {
    expect(cfg.devices[0]).toMatchObject({ port: 4370, comm_key: 0, send_users: true })
    expect(cfg.interval_minutes).toBe(5)
    expect(() => validateConfig({ supabase_url: 'http://x', devices: [] })).toThrow(/https/)
    expect(() => validateConfig({ supabase_url: 'https://x', devices: [{ serial: 'a', ip: 'b', bridge_key: 'nope' }] })).toThrow(/bridge_key/)
  })

  it('دورة ناجحة: يرسل الجديد فقط + المستخدمين، ويحدّث الحالة بآخر وقت', async () => {
    const sent: unknown[] = []
    const read = async () => ({
      info: { logCounts: 3, logCapacity: 100000 }, deviceTime: '2026-09-24 12:00:00',
      punches: [{ pin: '7', local: '2026-09-01 08:00:00' }, { pin: '7', local: '2026-09-24 08:00:00' }],
      users: [{ pin: '7', name: 'ليث' }],
    })
    const send = async (_c: unknown, _d: unknown, body: { punches: unknown[]; users?: unknown[] }) => {
      sent.push(body); return { received: body.punches.length, inserted: 1, duplicates: body.punches.length - 1, unmatched: 0, users: body.users?.length ?? 0 }
    }
    const state: Record<string, { last_local?: string }> = { 'ZK-001': { last_local: '2026-09-23 18:00:00' } }
    const summary = await cycle(cfg, state, { read, send, testOnly: false })
    expect(sent).toHaveLength(1)
    expect((sent[0] as { punches: unknown[] }).punches).toEqual([{ pin: '7', local: '2026-09-24 08:00:00' }])
    expect(summary[0]).toMatchObject({ serial: 'ZK-001', ok: true, received: 1, inserted: 1 })
    expect(state['ZK-001']?.last_local).toBe('2026-09-24 08:00:00')
  })

  it('فشل الاتصال بالجهاز: يُبلَّغ للمنصة كتقرير خطأ ويُحفظ في الحالة', async () => {
    const sent: Array<{ error?: string }> = []
    const read = async () => { throw Object.assign(new Error('x'), { err: { message: 'ETIMEDOUT' } }) }
    const send = async (_c: unknown, _d: unknown, body: { error?: string }) => { sent.push(body); return {} }
    const state: Record<string, { last_error?: string | null }> = {}
    const summary = await cycle(cfg, state, { read, send })
    expect(summary[0]).toMatchObject({ ok: false, error: 'ETIMEDOUT' })
    expect(sent[0]?.error).toBe('ETIMEDOUT')
    expect(state['ZK-001']?.last_error).toBe('ETIMEDOUT')
  })

  it('--test: يقرأ الجهاز بلا إرسال', async () => {
    let posts = 0
    const summary = await cycle(cfg, {}, { read: async () => ({ punches: [], users: [], info: null, deviceTime: null }), send: async () => { posts++; return {} }, testOnly: true })
    expect(posts).toBe(0)
    expect(summary[0]).toMatchObject({ ok: true, total: 0 })
  })
})
