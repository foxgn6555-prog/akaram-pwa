/** اختبار عقود Zod للمصادقة */
import { describe, it, expect } from 'vitest'
import { loginSchema, resetPasswordSchema } from '@features/auth/schemas/auth.schema'

describe('auth.schema', () => {
  it('يرفض بريداً غير صالح', () => {
    const result = loginSchema.safeParse({ email: 'not-email', password: '12345678' })
    expect(result.success).toBe(false)
  })

  it('يقبل بيانات صحيحة', () => {
    const result = loginSchema.safeParse({ email: 'a@b.co', password: '12345678' })
    expect(result.success).toBe(true)
  })

  it('يرفض كلمة مرور أقل من 8', () => {
    const result = loginSchema.safeParse({ email: 'a@b.co', password: '1234' })
    expect(result.success).toBe(false)
  })

  it('reset: يرفض عند عدم تطابق التأكيد', () => {
    const result = resetPasswordSchema.safeParse({
      password: '12345678',
      confirmPassword: '87654321',
    })
    expect(result.success).toBe(false)
  })

  it('reset: يقبل عند التطابق', () => {
    const result = resetPasswordSchema.safeParse({
      password: '12345678',
      confirmPassword: '12345678',
    })
    expect(result.success).toBe(true)
  })
})
