import { describe, expect, it } from 'vitest'
import { PERIODS, PERIOD_LABEL, arWeekday, periodRange, slashDate, suggestedDesignTitle } from '@features/media/constants'
import { periodTypeSchema } from '@features/media/schemas'

describe('الدورات: يومي وأسبوعي', () => {
  it('القائمة تحوي الأنواع الخمسة والمخطط يقبلها', () => {
    expect(PERIODS.map((p) => p.value)).toEqual(['daily', 'weekly', 'first_half', 'second_half', 'monthly'])
    for (const p of PERIODS) expect(periodTypeSchema.safeParse(p.value).success).toBe(true)
    expect(periodTypeSchema.safeParse('yearly').success).toBe(false)
    expect(PERIOD_LABEL.daily).toBe('يومي')
    expect(PERIOD_LABEL.weekly).toBe('أسبوعي')
  })

  it('يومي = اليوم نفسه، أسبوعي = السبت→الجمعة لأي يوم في الأسبوع', () => {
    const thu = new Date('2026-10-01T09:00:00+03:00')
    expect(periodRange('daily', thu)).toEqual({ start: '2026-10-01', end: '2026-10-01' })
    expect(periodRange('weekly', thu)).toEqual({ start: '2026-09-26', end: '2026-10-02' })
    expect(periodRange('weekly', new Date('2026-09-26T09:00:00+03:00'))).toEqual({ start: '2026-09-26', end: '2026-10-02' })
    expect(periodRange('weekly', new Date('2026-10-02T09:00:00+03:00'))).toEqual({ start: '2026-09-26', end: '2026-10-02' })
    expect(periodRange('weekly', new Date('2026-10-03T09:00:00+03:00'))).toEqual({ start: '2026-10-03', end: '2026-10-09' })
    // القديمة لم تتغير
    expect(periodRange('first_half', thu)).toEqual({ start: '2026-10-01', end: '2026-10-14' })
    expect(periodRange('monthly', thu)).toEqual({ start: '2026-10-01', end: '2026-10-31' })
  })

  it('صيغ اليوم والتاريخ كما في الصورة: «يوم الخميس» و 2026\\10\\1', () => {
    expect(arWeekday('2026-10-01')).toBe('يوم الخميس')
    expect(arWeekday('2026-09-26')).toBe('يوم السبت')
    expect(slashDate('2026-10-01')).toBe('2026\\10\\1')
  })

  it('العنوان الافتراضي يميز اليومي والأسبوعي', () => {
    const thu = new Date('2026-10-01T09:00:00+03:00')
    expect(suggestedDesignTitle('karrada', 'daily', thu)).toContain('التقرير اليومي المصور')
    expect(suggestedDesignTitle('karrada', 'daily', thu)).toContain('الخميس 1 تشرين الأول 2026')
    expect(suggestedDesignTitle('karrada', 'weekly', thu)).toContain('التقرير الأسبوعي المصور')
  })
})
