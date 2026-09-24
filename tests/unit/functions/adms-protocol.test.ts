import { describe, expect, it } from 'vitest'
import {
  buildOptionsResponse, parseAttlog, parseAttlogLine, parseOperlogUser, toAdmsTimeZone, toStamp,
} from '../../../supabase/functions/_shared/adms-protocol'

describe('ADMS · TimeZone (الخطأ الذي كان يزيح الأوقات 6 ساعات)', () => {
  it('بغداد +03:00 → «3» وليس «-3»', () => {
    expect(toAdmsTimeZone('+03:00')).toBe('3')
  })
  it('صيغ ZK: سالبة، نصف ساعة، ربع ساعة، افتراضي عند الفساد', () => {
    expect(toAdmsTimeZone('-05:00')).toBe('-5')
    expect(toAdmsTimeZone('+05:45')).toBe('545')
    expect(toAdmsTimeZone('-03:30')).toBe('-330')
    expect(toAdmsTimeZone('+00:00')).toBe('0')
    expect(toAdmsTimeZone(null)).toBe('3')
    expect(toAdmsTimeZone('3')).toBe('3')
    expect(toAdmsTimeZone('+3')).toBe('3')
  })
  it('رد الخيارات: TimeZone من منطقة الجهاز وليس السطر الأخير، وينتهي بسطر جديد', () => {
    const r = buildOptionsResponse({ sn: 'CL123', timezoneOffset: '+03:00' })
    const lines = r.trimEnd().split('\n')
    expect(lines[0]).toBe('GET OPTION FROM: CL123')
    expect(lines).toContain('TimeZone=3')
    expect(lines[lines.length - 1]).not.toMatch(/^TimeZone=/)
    expect(r.endsWith('\n')).toBe(true)
    expect(r).toContain('ATTLOGStamp=0')
    expect(r).toContain('Realtime=1')
    expect(buildOptionsResponse({ sn: 'X', timezoneOffset: '+04:00', attlogStamp: '2026-09-24 08:00:00' })).toContain('ATTLOGStamp=2026-09-24 08:00:00')
    expect(buildOptionsResponse({ sn: 'X', timezoneOffset: '+04:00' })).toContain('TimeZone=4')
  })
})

describe('ADMS · ATTLOG بصيغة الجهاز الحقيقية', () => {
  it('سطر TAB حقيقي بحقول إضافية فارغة', () => {
    expect(parseAttlogLine('2\t2022-07-12 16:00:20\t1\t15\t\t0\t0\t\t\t43')).toEqual({
      pin: '2', localTime: '2022-07-12 16:00:20', status: 1, verify: 15, workcode: null,
    })
  })
  it('الصيغة القديمة بالمسافات ما زالت مقبولة', () => {
    expect(parseAttlogLine('1001 2026-08-27 08:02:11 0 15')).toEqual({
      pin: '1001', localTime: '2026-08-27 08:02:11', status: 0, verify: 15, workcode: null,
    })
  })
  it('المشوّه = null ولا يُسقط الدفعة', () => {
    expect(parseAttlogLine('garbage')).toBeNull()
    expect(parseAttlogLine('7001\tbad time\t0')).toBeNull()
    expect(parseAttlogLine('\t2026-01-01 00:00:00\t0')).toBeNull()
    const r = parseAttlog('7001\t2026-09-24 08:00:00\t0\t1\n\ngarbage\n7002\t2026-09-24 08:05:00\t1\t1\n')
    expect(r.lines).toHaveLength(2)
    expect(r.malformed).toBe(1)
  })
  it('حالة غير رقمية = 255 (غير محدد) وworkcode يُلتقط', () => {
    expect(parseAttlogLine('7\t2026-09-24 08:00:00\tX\t1\tWC9')).toMatchObject({ status: 255, workcode: 'WC9' })
  })
})

describe('ADMS · OPERLOG مستخدمو الجهاز', () => {
  it('USER PIN=…\\tName=… → اسم وبطاقة وصلاحية', () => {
    expect(parseOperlogUser('USER PIN=2\tName=Johny Deep\tPri=0\tPasswd=\tCard=123\tGrp=1\tTZ=0000000100000000')).toEqual({
      pin: '2', name: 'Johny Deep', card: '123', privilege: 0,
    })
  })
  it('اسم عربي وقيم فارغة', () => {
    expect(parseOperlogUser('USER PIN=8101\tName=ليث توقيت\tPri=14\tCard=')).toEqual({ pin: '8101', name: 'ليث توقيت', card: null, privilege: 14 })
  })
  it('سجلات العمليات (غير المستخدمين) = null', () => {
    expect(parseOperlogUser('OPLOG 4\t0\t2026-09-24 07:00:00\t0\t0\t0\t0')).toBeNull()
    expect(parseOperlogUser('USER Name=x')).toBeNull()
  })
})

describe('ADMS · ختم الاستئناف', () => {
  it('وقت صالح يُمرَّر كما هو، وغير ذلك 0', () => {
    expect(toStamp('2026-09-24 08:00:00')).toBe('2026-09-24 08:00:00')
    expect(toStamp('bad')).toBe('0')
    expect(toStamp(null)).toBe('0')
  })
})
