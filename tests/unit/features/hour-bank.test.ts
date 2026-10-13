/** 00216: بنك الساعات الشهري — الحاسبة المحلية تطابق app.hr_hour_bank (نفس حالات اختبار قاعدة البيانات) */
import { describe, expect, it } from 'vitest'
import { applyShortfall, computeHourBank, SHORTFALL_METHOD_LABEL } from '@features/hr/lib/policy'

const full = (n: number, worked = 480) => Array.from({ length: n }, () => ({ required: 480, worked }))
const base = { shiftMinutes: 480, daysInMonth: 30, offDaysPerMonth: 5, creditCapDays: 2, graceMinutes: 10 }

describe('00216 — بنك الساعات', () => {
  it('حضور كامل كل أيام الشهر ⇒ المطلوب 25 يوماً والفائض 5 أيام يُسقَّف بـ 2', () => {
    const r = computeHourBank({ ...base, days: full(30) })
    expect(r).toMatchObject({ requiredDays: 25, requiredMinutes: 12000, creditedMinutes: 14400, netMinutes: 2400, deductionMinutes: 0, surplusMinutes: 2400, creditDays: 2, creditCapped: true })
  })
  it('التأخير فوق السماحية يُحتسب كاملاً ويعوّضه البقاء الأطول في يوم آخر؛ ضمن السماحية ⇒ يوم كامل', () => {
    const days = full(30)
    days[0] = { required: 480, worked: 420 }   // −60 فوق السماحية
    days[1] = { required: 480, worked: 540 }   // +60
    days[2] = { required: 480, worked: 475 }   // −5 ضمن السماحية ⇒ 480
    expect(computeHourBank({ ...base, days }).creditedMinutes).toBe(14400)
    days[1] = { required: 480, worked: 480 }
    expect(computeHourBank({ ...base, days }).netMinutes).toBe(2340)
  })
  it('20 يوماً بنقص ساعة ⇒ المطلوب لا يتجاوز أيام الحضور (20) والعجز 1200 دقيقة فقط؛ الغياب خارج البنك', () => {
    const r = computeHourBank({ ...base, days: full(20, 420) })
    expect(r).toMatchObject({ requiredDays: 20, requiredMinutes: 9600, creditedMinutes: 8400, netMinutes: -1200, deductionMinutes: 1200, creditDays: 0, creditCapped: false })
  })
  it('25 يوماً حضور + 5 إجازة مدفوعة ⇒ محايد (لا استقطاع ولا رصيد)', () => {
    expect(computeHourBank({ ...base, days: full(25) })).toMatchObject({ requiredMinutes: 12000, creditedMinutes: 12000, netMinutes: 0, deductionMinutes: 0, creditDays: 0 })
  })
  it('شهر جزئي: 15 يوماً مغطاة ⇒ الإجازة الشهرية بنسبة التغطية (2.5) · سقف 0 ⇒ لا رصيد · إعفاء غرفة العمليات = يوم كامل', () => {
    const r = computeHourBank({ ...base, coveredDays: 15, days: full(15) })
    expect(r.requiredDays).toBe(12.5); expect(r.creditDays).toBe(2); expect(r.surplusMinutes).toBe(1200)
    expect(computeHourBank({ ...base, creditCapDays: 0, days: full(30) })).toMatchObject({ creditDays: 0, creditCapped: true })
    expect(computeHourBank({ ...base, days: [{ required: 480, worked: 300, waived: true }] }).creditedMinutes).toBe(480)
  })
  it('الطريقة معرّفة في القائمة ولا تُنتج استقطاعاً يومياً', () => {
    expect(SHORTFALL_METHOD_LABEL.hour_bank).toContain('بنك الساعات')
    expect(applyShortfall({ shortfall_method: 'hour_bank', deduction_tiers: [] }, 90)).toEqual({ minutes: 0, days: 0, note: 'يُصفّى شهرياً ضمن بنك الساعات' })
  })
})
