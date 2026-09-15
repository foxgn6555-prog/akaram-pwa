/**
 * اختبارات مخططات مشتريات الصيانة — تحقق Zod + حسابات المبالغ
 */
import { describe, expect, it } from 'vitest'
import {
  MAINTENANCE_STAGES,
  PART_CATEGORIES,
  money,
  partCategoryLabel,
  purchaseLineTotal,
  purchaseOrderSchema,
  purchaseOrderTotal,
  stageLabel,
} from '@features/vehicle-operations/purchase-schemas'

describe('أقسام المخزون والمراحل', () => {
  it('خمسة أقسام: الأربعة الرئيسية + أخرى', () => {
    expect(PART_CATEGORIES.map((c) => c.value)).toEqual([
      'mechanical',
      'electrical',
      'bodywork',
      'metalwork',
      'other',
    ])
  })

  it('خمس مراحل بالترتيب الصحيح يبدأ بالتشخيص بعد الاستلام', () => {
    expect(MAINTENANCE_STAGES.map((s) => s.key)).toEqual([
      'arrival',
      'diagnosis',
      'repair',
      'inspection',
      'handover',
    ])
    expect(MAINTENANCE_STAGES.map((s) => s.no)).toEqual([1, 2, 3, 4, 5])
  })

  it('التسميات العربية موجودة لكل قسم ومرحلة', () => {
    for (const c of PART_CATEGORIES) expect(partCategoryLabel(c.value)).toBe(c.label)
    for (const s of MAINTENANCE_STAGES) expect(stageLabel(s.key)).toBe(s.label)
    expect(partCategoryLabel('unknown')).toBe('unknown')
  })
})

describe('مخطط أمر الشراء', () => {
  const validItem = {
    part_category: 'mechanical',
    item_name: 'فلتر زيت',
    quantity: 2,
    unit: 'قطعة',
    unit_price: 25000,
  }

  it('يقبل أمراً صالحاً بعدة أصناف وأقسام', () => {
    const result = purchaseOrderSchema.safeParse({
      supplier_name: 'مؤسسة القطع',
      notes: 'أولوية عالية',
      items: [
        validItem,
        { ...validItem, part_category: 'electrical', item_name: 'مضخة وقود', quantity: 1, unit_price: 180000 },
        { ...validItem, part_category: 'other', item_name: 'زيت هيدروليك', quantity: 10, unit: 'لتر', unit_price: 8500 },
      ],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.items).toHaveLength(3)
    }
  })

  it('يرفض الأمر بلا أصناف', () => {
    const result = purchaseOrderSchema.safeParse({ supplier_name: '', notes: '', items: [] })
    expect(result.success).toBe(false)
  })

  it('يرفض صنفاً باسم قصير أو كمية غير صحيحة أو سعراً سالباً', () => {
    expect(
      purchaseOrderSchema.safeParse({ items: [{ ...validItem, item_name: 'أ' }] }).success,
    ).toBe(false)
    expect(
      purchaseOrderSchema.safeParse({ items: [{ ...validItem, quantity: 0 }] }).success,
    ).toBe(false)
    expect(
      purchaseOrderSchema.safeParse({ items: [{ ...validItem, unit_price: -5 }] }).success,
    ).toBe(false)
  })

  it('يرفض نوع قطعة خارج الأقسام المعتمدة', () => {
    const result = purchaseOrderSchema.safeParse({
      items: [{ ...validItem, part_category: 'hydraulics' }],
    })
    expect(result.success).toBe(false)
  })
})

describe('حساب المبالغ بالدينار العراقي', () => {
  it('الإجمالي للسطر = كمية × سعر (بقرّيب سنتي)', () => {
    expect(purchaseLineTotal(4, 25000)).toBe(100000)
    expect(purchaseLineTotal(10, 8500)).toBe(85000)
    expect(purchaseLineTotal(3, 1500.5)).toBe(4501.5)
  })

  it('إجمالي الأمر = مجموع الأسطر', () => {
    const total = purchaseOrderTotal([
      { quantity: 4, unit_price: 25000 },
      { quantity: 1, unit_price: 180000 },
      { quantity: 10, unit_price: 8500 },
    ])
    expect(total).toBe(365000)
  })

  it('التنسيق بأرقام عربية', () => {
    expect(money(365000)).toBe('٣٦٥٬٠٠٠')
  })
})
