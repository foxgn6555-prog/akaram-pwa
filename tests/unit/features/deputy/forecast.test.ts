/** أدوات التنبؤ: انحدار خطي، نطاق ثقة، متوسط متحرك، معدل نمو */
import { describe, expect, it } from 'vitest'
import { forecast, growthRate, linearRegression, movingAverage, trendLabel } from '@features/deputy/lib/forecast'

describe('أدوات التحليل والتنبؤ', () => {
  it('الانحدار الخطي يلتقط ميلاً ثابتاً بدقة كاملة', () => {
    const reg = linearRegression([2, 4, 6, 8])
    expect(reg.slope).toBeCloseTo(2)
    expect(reg.intercept).toBeCloseTo(2)
    expect(reg.r2).toBeCloseTo(1)
  })
  it('التنبؤ يمدد السلسلة أفقاً ويحسب نطاق ثقة', () => {
    const fc = forecast([10, 12, 14, 16], 7)
    expect(fc).toHaveLength(11)
    const first = fc[4]!
    expect(first.projected).toBe(true)
    expect(first.value).toBeCloseTo(18)
    expect(first.low!).toBeLessThanOrEqual(first.value)
    expect(first.high!).toBeGreaterThanOrEqual(first.value)
  })
  it('المتوسط المتحرك يمهد الضجيج دون تغيير الطول', () => {
    const sm = movingAverage([1, 10, 2, 9, 3], 3)
    expect(sm).toHaveLength(5)
    expect(sm[1]!).toBeLessThan(10)
  })
  it('معدل النمو واتجاه السلسلة', () => {
    expect(growthRate([10, 10, 10, 20, 20, 20])).toBe(100)
    expect(trendLabel(0.5)).toBe('تصاعدي')
    expect(trendLabel(-0.5)).toBe('تنازلي')
    expect(trendLabel(0)).toBe('مستقر')
  })
})
