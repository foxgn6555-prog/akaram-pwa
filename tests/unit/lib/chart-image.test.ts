/**
 * منشئ الرسوم البيانية للتصدير (canvas → PNG).
 * في بيئة الاختبار (jsdom بلا canvas) يعيد null بأمان دون رمي خطأ.
 */
import { describe, it, expect } from 'vitest'
import { renderBarChartPng, renderDonutChartPng } from '@lib/export/chart-image'

const data = [
  { label: 'تأخير', value: 5, color: '#f59e0b' },
  { label: 'غياب', value: 3, color: '#ef4444' },
]

describe('chart-image — التعامل الآمن مع غياب canvas', () => {
  it('renderBarChartPng لا يرمي خطأ في بيئة بلا canvas (jsdom)', () => {
    expect(() => renderBarChartPng(data, { title: 'توزيع' })).not.toThrow()
    const out = renderBarChartPng(data, { title: 'توزيع' })
    // jsdom getContext معدّ ليعيد null — الناتج null ويُتخطى دمج الصورة
    expect(out === null || out instanceof Uint8Array).toBe(true)
  })

  it('يعيد null عند خلو البيانات', () => {
    expect(renderBarChartPng([], { title: 'فارغ' })).toBeNull()
    expect(renderBarChartPng([{ label: 'x', value: 0 }], { title: 'أصفار' })).toBeNull()
  })

  it('renderDonutChartPng لا يرمي ويتجاهل الشرائح الصفرية', () => {
    expect(() => renderDonutChartPng(data, { title: 'الحالة' })).not.toThrow()
    expect(renderDonutChartPng([], { title: 'فارغ' })).toBeNull()
    expect(renderDonutChartPng([{ label: 'x', value: 0 }], { title: 'أصفار' })).toBeNull()
  })
})
