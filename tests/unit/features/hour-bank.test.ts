/** 00216/00218: بنك الساعات — قاعدة اليوم الواحد: الحاسبة المحلية تطابق app.hr_compute_day_metrics/hr_hour_bank (نفس حالات اختبار قاعدة البيانات) */
import { describe, expect, it } from 'vitest'
import { applyShortfall, computeHourBank, hourBankDay, SHORTFALL_METHOD_LABEL, type HourBankDay } from '@features/hr/lib/policy'

const base = { shiftMinutes: 480, creditCapDays: 2, graceMinutes: 10 }
const full = (n: number): HourBankDay[] => Array.from({ length: n }, () => ({ required: 480 }))

describe('00218 — بنك الساعات: اليوم الواحد', () => {
  it('تأخر 30 وخرج بالنهاية ⇒ نقص 30 · تأخر 30 وبقي 30 ⇒ 0 · تأخر 30 وبقي 50 ⇒ فائض 20 · ضمن السماحية ⇒ 0', () => {
    expect(hourBankDay({ required: 480, lateMinutes: 30 }, 10)).toEqual({ shortfall: 30, surplus: 0 })
    expect(hourBankDay({ required: 480, lateMinutes: 30, extraMinutes: 30 }, 10)).toEqual({ shortfall: 0, surplus: 0 })
    expect(hourBankDay({ required: 480, lateMinutes: 30, extraMinutes: 50 }, 10)).toEqual({ shortfall: 0, surplus: 20 })
    expect(hourBankDay({ required: 480, lateMinutes: 5, extraMinutes: 20 }, 10)).toEqual({ shortfall: 0, surplus: 20 })
    expect(hourBankDay({ required: 480, lateMinutes: 11 }, 10).shortfall).toBe(11)
  })
  it('المجيء المبكر فائض ولا يعوّض الخروج المبكر؛ الزمنية المدفوعة تغطي النقص؛ الإعفاء يصفّره', () => {
    expect(hourBankDay({ required: 480, earlyInMinutes: 15, earlyOutMinutes: 15 }, 10)).toEqual({ shortfall: 15, surplus: 15 })
    expect(hourBankDay({ required: 480, earlyOutMinutes: 60, permitMinutes: 60 }, 10).shortfall).toBe(0)
    expect(hourBankDay({ required: 480, lateMinutes: 90, waived: true }, 10)).toEqual({ shortfall: 0, surplus: 0 })
  })
  it('الشهر: لا تعويض بين الأيام — نقص 75 وفائض 75 ⇒ يُستقطع 75 ويُقيَّد 0.156 يوم', () => {
    const days = full(30)
    days[0] = { required: 480, lateMinutes: 60 }; days[1] = { required: 480, extraMinutes: 60 }; days[2] = { required: 480, lateMinutes: 5 }
    days[3] = { required: 480, lateMinutes: 30, extraMinutes: 30 }; days[4] = { required: 480, earlyInMinutes: 15, earlyOutMinutes: 15 }
    expect(computeHourBank({ ...base, days })).toMatchObject({ requiredMinutes: 14400, deductionMinutes: 75, surplusMinutes: 75, netMinutes: 0, daysShort: 2, creditDays: 0.156, creditCapped: false })
  })
  it('20 يوماً بخروج مبكر ساعة ⇒ 1200 دقيقة · حضور كامل ⇒ صفر · السقف يقيّد الفائض', () => {
    expect(computeHourBank({ ...base, days: Array.from({ length: 20 }, () => ({ required: 480, earlyOutMinutes: 60 })) })).toMatchObject({ requiredMinutes: 9600, creditedMinutes: 8400, deductionMinutes: 1200, creditDays: 0 })
    expect(computeHourBank({ ...base, days: full(30) })).toMatchObject({ deductionMinutes: 0, surplusMinutes: 0, creditDays: 0 })
    expect(computeHourBank({ ...base, days: Array.from({ length: 30 }, () => ({ required: 480, extraMinutes: 60 })) })).toMatchObject({ surplusMinutes: 1800, creditDays: 2, creditCapped: true })
    expect(computeHourBank({ ...base, shiftMinutes: 360, creditCapDays: 5, days: Array.from({ length: 6 }, () => ({ required: 360, extraMinutes: 60 })) }).creditDays).toBe(1)
  })
  it('الطريقة معرّفة؛ نقص اليوم يُقترح بالدقيقة', () => {
    expect(SHORTFALL_METHOD_LABEL.hour_bank).toContain('بنك الساعات')
    expect(applyShortfall({ shortfall_method: 'hour_bank', deduction_tiers: [] }, 90)).toEqual({ minutes: 90, days: 0, note: 'بنك الساعات: نقص اليوم بالدقيقة' })
  })
})
