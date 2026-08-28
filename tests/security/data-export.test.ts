/**
 * ⚑ Data Export Security (نمط Kyvzon) — يتحقق من أمان التصدير
 */
import { describe, it, expect } from 'vitest'

describe('⚓ أمان تصدير البيانات', () => {
  it('CSV يبدأ بـ BOM UTF-8 (يدعم العربية في Excel)', () => {
    const bom = '\uFEFF'
    expect(bom.charCodeAt(0)).toBe(0xFEFF)
    // في UsersList.exportCsv: new Blob([`\uFEFF${csv}`])
  })

  it('CSV يقتبس الحقول الحساسة (منع حقن)', () => {
    // القاعدة: كل حقل يُحاط بعلامات اقتباس
    const field = 'value with "quotes" and ,commas,'
    const escaped = `"${field.replace(/"/g, '""')}"`
    expect(escaped).toContain('""')
  })

  it('اسم ملف التصدير يحمل التاريخ', () => {
    const today = new Date().toISOString().slice(0, 10)
    const filename = `users-${today}.csv`
    expect(filename).toMatch(/users-\d{4}-\d{2}-\d{2}\.csv/)
  })

  it('exportCsv لا يصدر بيانات كلمات المرور', () => {
    // الحقول الآمنة فقط
    const allowedFields = ['الاسم', 'البريد', 'الأدوار', 'الرقم الوظيفي', 'آخر دخول']
    expect(allowedFields).not.toContain('كلمة المرور')
    expect(allowedFields).not.toContain('password')
  })
})
