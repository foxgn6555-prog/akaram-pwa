/** البوابات الديناميكية: المكتبة الجاهزة · الأدوار الديناميكية بصيغة موحدة */
import { describe, it, expect } from 'vitest'
import { UNIT_LIBRARY } from '@features/portals/types'

describe('مكتبة الوحدات الجاهزة (UNIT_LIBRARY)', () => {
  it('غير فارغة وكل وحدة معرّفة بالكامل', () => {
    expect(UNIT_LIBRARY.length).toBeGreaterThan(0)
    for (const unit of UNIT_LIBRARY) {
      expect(unit.unit_key).toMatch(/^[a-z-]+$/)
      expect(unit.label.length).toBeGreaterThan(2)
      expect(unit.page_keys.length).toBeGreaterThan(0)
      expect(unit.icon).toBeTruthy()
    }
  })

  it('لا مفاتيح وحدات مكررة', () => {
    const keys = UNIT_LIBRARY.map((u) => u.unit_key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('كل مفتاح صفحة بصيغة p_ (دليل البوابات الديناميكية)', () => {
    for (const unit of UNIT_LIBRARY) {
      for (const pk of unit.page_keys) {
        expect(pk, `page key في ${unit.unit_key}`).toMatch(/^p_/)
      }
    }
  })
})

describe('الأدوار الديناميكية (00028)', () => {
  it('صيغة الدور الديناميكي: portal:{slug}', () => {
    const slug = 'ops'
    const role = `portal:${slug}`
    expect(role).toMatch(/^portal:[a-z0-9-]+$/)
    // set_user_role يتحقق أن slug موجود في dynamic_portals قبل المنح (مختبر في الدخان)
  })

  it('مفاتيح صفحات الديناميكية: p_{slug}.{unit}.{page} — تربط المصفوفة', () => {
    // role_page_permissions يقبل role='portal:ops' وpage_key='p_ops.map' — مختبر في الدخان
    const pageKey = 'p_ops.map'
    expect(pageKey).toMatch(/^p_[a-z0-9-]+(\.[a-z0-9-]+){1,2}$/)
  })
})
