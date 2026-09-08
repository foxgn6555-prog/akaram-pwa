/** عقد إنشاء مستخدم: كلمة مرور صارمة + أدوار معروفة + ربط موظف اختياري */
import { describe, it, expect } from 'vitest'
import { createSuperAdminSchema } from '@features/user-management/schemas/create-user.schema'

const VALID = {
  email: 'new@akram.iq',
  password: 'Passw0rd1',
  full_name: 'علي حسن محمد',
  role: 'employee',
}

describe('create-user.schema', () => {
  it('يقبل بيانات صحيحة كاملة', () => {
    expect(createSuperAdminSchema.safeParse(VALID).success).toBe(true)
  })

  it('يقبل بدون ربط موظف (حقول اختيارية فارغة)', () => {
    const r = createSuperAdminSchema.safeParse({
      ...VALID,
      employee_number: '',
      department_id: '',
      job_title: '',
    })
    expect(r.success).toBe(true)
  })

  it('يرفض كلمة مرور أقل من 8', () => {
    const r = createSuperAdminSchema.safeParse({ ...VALID, password: 'Ab1' })
    expect(r.success).toBe(false)
  })

  it('يرفض كلمة مرور بلا أرقام', () => {
    const r = createSuperAdminSchema.safeParse({ ...VALID, password: 'Abcdefgh' })
    expect(r.success).toBe(false)
  })

  it('يرفض كلمة مرور بلا أحرف', () => {
    const r = createSuperAdminSchema.safeParse({ ...VALID, password: '12345678' })
    expect(r.success).toBe(false)
  })

  it('يقبل دور مسؤول الإعلام', () => {
    expect(createSuperAdminSchema.safeParse({ ...VALID, role: 'media_officer' }).success).toBe(true)
  })

  it('يقبل دور مسؤول الكراج المركزي', () => {
    expect(createSuperAdminSchema.safeParse({ ...VALID, role: 'central_garage_officer' }).success).toBe(true)
  })

  it('يرفض دوراً خارج القائمة', () => {
    const r = createSuperAdminSchema.safeParse({ ...VALID, role: 'hacker' })
    expect(r.success).toBe(false)
  })

  it('يرفض بريداً غير صالح', () => {
    const r = createSuperAdminSchema.safeParse({ ...VALID, email: 'nope' })
    expect(r.success).toBe(false)
  })

  it('يرفض رقماً وظيفياً بحروف عربية (إنجليزية فقط)', () => {
    const r = createSuperAdminSchema.safeParse({ ...VALID, employee_number: 'وظ-١٢٣' })
    expect(r.success).toBe(false)
  })
})
