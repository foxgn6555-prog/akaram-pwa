/** تنسيقات مسار الصرف: أرقام إنكليزية دائماً، أشهر عراقية، منذ…، التغيّر %، دقائق، وخطوة الشريط */
import { describe, expect, it } from 'vitest'
import { agoAr, blockReasonLabel, changePct, clock, dayLabel, disbursementStep, iqd, minutesLabel, monthTitle, signedPct, stamp } from '@features/disbursements/format'

const ARABIC_INDIC = /[\u0660-\u0669\u06f0-\u06f9]/

describe('disbursements/format', () => {
  it('monthTitle: الأشهر العراقية بالسنة، لكل الأشهر الاثني عشر', () => {
    const all = Array.from({ length: 12 }, (_, i) => monthTitle(`2026-${String(i + 1).padStart(2, '0')}-15`))
    expect(all).toEqual(['كانون الثاني 2026', 'شباط 2026', 'آذار 2026', 'نيسان 2026', 'أيار 2026', 'حزيران 2026', 'تموز 2026', 'آب 2026', 'أيلول 2026', 'تشرين الأول 2026', 'تشرين الثاني 2026', 'كانون الأول 2026'])
    expect(monthTitle('2026-10')).toBe('تشرين الأول 2026')
    for (const s of all) expect(s).not.toMatch(ARABIC_INDIC)
  })
  it('iqd: فواصل الآلاف إنكليزية و«—» لغير الموجود، والصفر صفر', () => {
    expect(iqd(38450000)).toBe('38,450,000 د.ع'); expect(iqd(0)).toBe('0 د.ع'); expect(iqd(null)).toBe('—'); expect(iqd(undefined)).toBe('—')
    expect(iqd(-8450000)).toContain('8,450,000')
    expect(iqd(1234567)).not.toMatch(ARABIC_INDIC)
  })
  it('agoAr: الآن/دقيقة/دقيقتان/دقائق/دقيقة(11+)/ساعة/ساعتان/ساعات/أيام — بأرقام إنكليزية', () => {
    const now = Date.UTC(2026, 10, 17, 12, 0, 0)
    const at = (min: number) => agoAr(new Date(now - min * 60_000).toISOString(), now)
    expect(agoAr(null, now)).toBe('—'); expect(agoAr(undefined, now)).toBe('—')
    expect(at(0)).toBe('الآن'); expect(at(1)).toBe('قبل دقيقة'); expect(at(2)).toBe('قبل دقيقتين'); expect(at(5)).toBe('قبل 5 دقائق'); expect(at(10)).toBe('قبل 10 دقائق'); expect(at(20)).toBe('قبل 20 دقيقة')
    expect(at(60)).toBe('قبل ساعة'); expect(at(120)).toBe('قبل ساعتين'); expect(at(5 * 60)).toBe('قبل 5 ساعات'); expect(at(15 * 60)).toBe('قبل 15 ساعة')
    expect(at(24 * 60)).toBe('قبل يوم'); expect(at(48 * 60)).toBe('قبل يومين'); expect(at(5 * 24 * 60)).toBe('قبل 5 أيام'); expect(at(15 * 24 * 60)).toBe('قبل 15 يوماً')
    expect(agoAr(new Date(now + 5 * 60_000).toISOString(), now)).toBe('الآن') // وقت مستقبلي (فرق ساعة الأجهزة) لا يظهر سالباً
    for (const s of [at(5), at(20), at(15 * 60), at(15 * 24 * 60)]) expect(s).not.toMatch(ARABIC_INDIC)
  })
  it('clock/stamp: بتوقيت بغداد (UTC+3) بأرقام إنكليزية', () => {
    expect(clock('2026-11-17T11:05:00Z')).toBe('14:05'); expect(clock('2026-11-17T21:30:00Z')).toBe('00:30'); expect(clock(null)).toBe('—')
    expect(stamp('2026-11-17T11:05:00Z')).toBe('2026-11-17 · 14:05'); expect(stamp(undefined)).toBe('—')
    expect(stamp('2026-11-17T22:00:00Z')).toBe('2026-11-18 · 01:00') // عبور منتصف الليل بتوقيت بغداد
  })
  it('changePct/signedPct: التغيّر عن السابق مقرَّب لخانة، ولا نسبة بلا سابق أو بسابق صفر', () => {
    expect(changePct(38450000, 37100000)).toBe(3.6); expect(changePct(90, 100)).toBe(-10); expect(changePct(100, 100)).toBe(0)
    expect(changePct(5, null)).toBeNull(); expect(changePct(5, undefined)).toBeNull(); expect(changePct(5, 0)).toBeNull()
    expect(signedPct(3.6)).toBe('+3.6%'); expect(signedPct(-10)).toBe('−10.0%'); expect(signedPct(0)).toBe('0.0%')
  })
  it('dayLabel: اسم اليوم العربي من التاريخ بلا انزياح منطقة زمنية', () => {
    expect(dayLabel('2026-11-02')).toBe('الاثنين 2'); expect(dayLabel('2026-11-01')).toBe('الأحد 1'); expect(dayLabel('2026-11-07')).toBe('السبت 7'); expect(dayLabel('2026-10-31T23:30:00Z')).toBe('السبت 31')
  })
  it('blockReasonLabel: أسباب الحجب الثلاثة، وسبب مجهول «محجوب»، وبلا سبب فارغ', () => {
    expect(blockReasonLabel('absent')).toBe('غياب البصمة'); expect(blockReasonLabel('leave')).toBe('إجازة معتمدة'); expect(blockReasonLabel('no_record')).toBe('بلا سجل حضور')
    expect(blockReasonLabel('x')).toBe('محجوب'); expect(blockReasonLabel(null)).toBe(''); expect(blockReasonLabel(undefined)).toBe('')
  })
  it('minutesLabel: 0 / دقائق / ساعات بدقائق', () => {
    expect(minutesLabel(null)).toBe('0'); expect(minutesLabel(0)).toBe('0'); expect(minutesLabel(-5)).toBe('0'); expect(minutesLabel(45)).toBe('45د'); expect(minutesLabel(60)).toBe('1س'); expect(minutesLabel(75)).toBe('1س 15د'); expect(minutesLabel(720)).toBe('12س')
  })
  it('disbursementStep: لكل حالة طلب نص وحالة الخطوة', () => {
    const d = (status: string) => ({ request_no: 'DSB-2026-0001', status }) as never
    expect(disbursementStep(null, false)).toEqual({ hint: 'يُنشأ تلقائياً عند اعتماد المالية', state: 'todo' })
    expect(disbursementStep(undefined, true)).toEqual({ hint: 'لا طلب صرف لهذا الشهر', state: 'todo' })
    expect(disbursementStep(d('pending_approval'), true)).toEqual({ hint: 'DSB-2026-0001 · بانتظار قرار المدير المفوض', state: 'active' })
    expect(disbursementStep(d('approved'), true)).toEqual({ hint: 'DSB-2026-0001 · معتمد — بانتظار الصرف من القاصة', state: 'active' })
    expect(disbursementStep(d('paid'), true)).toEqual({ hint: 'DSB-2026-0001 · صُرف من القاصة', state: 'done' })
    expect(disbursementStep(d('rejected'), true)).toEqual({ hint: 'DSB-2026-0001 · رفضه المدير المفوض — أعد الإرسال', state: 'bad' })
  })
})
