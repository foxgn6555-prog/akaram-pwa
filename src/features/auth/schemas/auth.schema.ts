/** Zod — عقود الإدخال للمصادقة (التحقق مزدوج: عميل هنا + DB على الخادم) */
import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().min(1, 'البريد الإلكتروني مطلوب').email('صيغة البريد غير صحيحة'),
  password: z.string().min(8, 'كلمة المرور 8 أحرف على الأقل'),
})

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, 'كلمة المرور 8 أحرف على الأقل'),
    confirmPassword: z.string().min(1, 'تأكيد كلمة المرور مطلوب'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'كلمتا المرور غير متطابقتين',
    path: ['confirmPassword'],
  })

export const forgotPasswordSchema = z.object({
  email: z.string().email('صيغة البريد غير صحيحة'),
})

export type LoginInput = z.infer<typeof loginSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
