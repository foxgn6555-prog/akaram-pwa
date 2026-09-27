/** محرك الاستنتاجات والفترات وأوراق Excel للإدارة العليا — منطق صافٍ */
import { describe, expect, it } from 'vitest'
import { buildInsights, healthScore, attendanceRate, pct } from '@features/executive/lib/insights'
import { presetRange, previousRange, reportKindLabel, periodLabel } from '@features/executive/lib/period'
import { buildExecSheets } from '@features/executive/lib/execExcel'
import { sample } from '../../fixtures/exec-overview'

describe('الفترات الجاهزة', () => {
  const today = new Date(2026, 8, 27) // 2026-09-27
  it('اليوم/الأسبوع/الشهر/الربع/النصف/السنة', () => {
    expect(presetRange('today', today)).toEqual({ from: '2026-09-27', to: '2026-09-27' })
    expect(presetRange('yesterday', today)).toEqual({ from: '2026-09-26', to: '2026-09-26' })
    expect(presetRange('week', today)).toEqual({ from: '2026-09-21', to: '2026-09-27' })
    expect(presetRange('month', today)).toEqual({ from: '2026-09-01', to: '2026-09-27' })
    expect(presetRange('prev_month', today)).toEqual({ from: '2026-08-01', to: '2026-08-31' })
    expect(presetRange('quarter', today)).toEqual({ from: '2026-07-01', to: '2026-09-27' })
    expect(presetRange('half', today)).toEqual({ from: '2026-07-01', to: '2026-09-27' })
    expect(presetRange('year', today)).toEqual({ from: '2026-01-01', to: '2026-09-27' })
  })
  it('الفترة السابقة المكافئة بنفس الطول', () => {
    expect(previousRange('2026-09-01', '2026-09-27')).toEqual({ from: '2026-08-05', to: '2026-08-31' })
    expect(previousRange('2026-09-27', '2026-09-27')).toEqual({ from: '2026-09-26', to: '2026-09-26' })
    expect(previousRange('2026-01-01', '2026-12-31')).toEqual({ from: '2025-01-01', to: '2025-12-31' })
  })
  it('تسمية نوع التقرير حسب الطول', () => {
    expect(reportKindLabel('2026-09-27', '2026-09-27')).toBe('تقرير يومي')
    expect(reportKindLabel('2026-09-01', '2026-09-30')).toBe('تقرير شهري')
    expect(reportKindLabel('2026-01-01', '2026-06-30')).toBe('تقرير نصف سنوي')
    expect(reportKindLabel('2026-01-01', '2026-12-31')).toBe('تقرير سنوي')
    expect(periodLabel('2026-09-27', '2026-09-27')).toBe('يوم 2026-09-27')
  })
})

describe('الاستنتاجات', () => {
  it('نسبة التغير ونسبة الحضور', () => {
    expect(pct(120, 100)).toBe(20); expect(pct(80, 100)).toBe(-20); expect(pct(5, 0)).toBeNull(); expect(pct(0, 0)).toBe(0)
    expect(attendanceRate(sample().workforce.attendance)).toBe(Math.round((860 / 910) * 100))
  })
  it('تبني جملاً عربية صافية مع الاتجاه مقارنةً بالفترة السابقة', () => {
    const prev = sample({ complaints: { ...sample().complaints, total: 50, open: 10, resolved: 40 } })
    const ins = buildInsights(sample(), prev)
    const c = ins.find((i) => i.id === 'complaints')!
    expect(c.text).toContain('وردت 100 شكوى')
    expect(c.text).toContain('بارتفاع 100٪')
    expect(c.tone).toBe('bad')                           // ارتفاع كبير في الشكاوى = سلبي
    expect(ins.find((i) => i.id === 'complaints_rate')!.text).toContain('70٪')
    expect(ins.find((i) => i.id === 'station_viol')!.text).toContain('20 مخالفة')
    expect(ins.find((i) => i.id === 'attendance')!.text).toMatch(/نسبة الحضور 9[45]٪/)
    expect(ins.find((i) => i.id === 'payroll')!.text).toContain('معتمد')
    expect(ins.find((i) => i.id === 'budget')!.text).toContain('60٪')
    expect(ins.find((i) => i.id === 'leaves_pending')!.text).toContain('4 طلب')
  })
  it('بلا فترة سابقة: لا مقارنة — وبلا بيانات: جمل «لا شيء» بدل الأرقام الفارغة', () => {
    const ins = buildInsights(sample(), null)
    expect(ins.find((i) => i.id === 'complaints')!.text).toContain('لا بيانات سابقة')
    const empty = sample({ complaints: { total: 0, open: 0, resolved: 0, by_status: [], by_sector: [], by_type: [], series: [] }, station: { ...sample().station, weighings: 0, tons: 0, violations: 0 } })
    const e = buildInsights(empty, null)
    expect(e.find((i) => i.id === 'complaints')!.text).toBe('لم تُسجَّل أي شكوى خلال الفترة.')
    expect(e.find((i) => i.id === 'complaints')!.tone).toBe('good')
    expect(e.find((i) => i.id === 'station')!.text).toContain('لا عمليات وزن')
    expect(e.find((i) => i.id === 'station_viol')).toBeUndefined()
  })
  it('مؤشر الصحة العام ينخفض مع سوء المؤشرات', () => {
    const good = healthScore(sample({ workforce: { ...sample().workforce, attendance: { ...sample().workforce.attendance, absent: 0, late: 0 } }, station: { ...sample().station, violations: 0 }, fleet: { ...sample().fleet, maintenance: { ...sample().fleet.maintenance, open_now: 0 } } }))
    const bad = healthScore(sample({ workforce: { ...sample().workforce, attendance: { ...sample().workforce.attendance, absent: 400 } }, station: { ...sample().station, violations: 200 } }))
    expect(good.score).toBeGreaterThan(bad.score)
    expect(good.label).toBe('ممتاز')
    expect(bad.score).toBeLessThan(60)
  })
})

describe('أوراق Excel', () => {
  it('عشر أوراق بأسماء ثابتة، والملخص يقارن الفترتين، والحالات معرَّبة', () => {
    const ins = buildInsights(sample(), sample())
    const sheets = buildExecSheets(sample(), ins, sample())
    expect(sheets.map((s) => s.name)).toEqual(['الملخص', 'الاستنتاجات', 'الشكاوى', 'الأسطول والصيانة', 'المحطة التحويلية', 'الموارد البشرية', 'الكشوفات', 'المالية', 'الإعلام والتجهيز', 'السلاسل اليومية'])
    expect(sheets[0]!.columns).toEqual(['المؤشر', 'الفترة الحالية', 'الفترة السابقة', 'التغيّر'])
    expect(sheets[0]!.rows[0]).toEqual(['الشكاوى الواردة', 100, 100, '0٪'])
    expect(sheets[0]!.title).toContain('تقرير شهري')
    const complaints = sheets[2]!
    expect(complaints.rows).toContainEqual(['جديدة', 30])
    expect(complaints.rows).toContainEqual(['الكرادة', 60])
    expect(sheets[1]!.rows.length).toBe(ins.length)
    expect(sheets[9]!.rows[0]).toEqual(['2026-09-01', 4, 20, 100, 90, 5, 5])
  })
  it('بلا مقارنة: عمودان فقط', () => {
    const sheets = buildExecSheets(sample(), [], null)
    expect(sheets[0]!.columns).toEqual(['المؤشر', 'القيمة'])
    expect(sheets[0]!.rows[0]).toEqual(['الشكاوى الواردة', 100])
  })
})
