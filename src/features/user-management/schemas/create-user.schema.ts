/**
 * Zod — عقد إنشاء مستخدم (التحقق المزدوج: هنا + Edge Function + DB)
 * سياسة كلمة المرور: 8+ أحرف · حرف واحد على الأقل · رقم واحد على الأقل
 */
import { z } from 'zod'

export const createSuperAdminSchema = z.object({
  email: z.string().min(1, 'البريد الإلكتروني مطلوب').email('صيغة البريد غير صحيحة'),
  /** كلمة مرور مبدئية — يُطلب تغييرها عند أول دخول (سياسة قادمة عبر Auth) */
  password: z
    .string()
    .min(8, 'كلمة المرور: 8 أحرف على الأقل')
    .regex(/[A-Za-z\u0600-\u06FF]/, 'كلمة المرور يجب أن تحتوي حرفاً واحداً على الأقل')
    .regex(/[0-9]/, 'كلمة المرور يجب أن تحتوي رقماً واحداً على الأقل'),
  full_name: z.string().min(3, 'الاسم الكامل مطلوب (3 أحرف فأكثر)'),
  role: z.enum([
    'employee', 'hr_officer', 'department_manager',
    'finance_officer', 'it_admin', 'super_admin',
  ], { message: 'اختر دوراً للمستخدم' }),
  /** ربط سجل موظف — اختياري لكنه المعتاد في الشركة */
  employee_number: z
    .string()
    .regex(/^[A-Za-z0-9-]*$/, 'الرقم الوظيفي: حروف إنجليزية وأرقام وشرطات فقط')
    .optional()
    .or(z.literal('')),
  department_id: z.string().uuid('اختر القسم').optional().or(z.literal('')),
  job_title: z.string().max(100, 'المسمى طويل جداً').optional().or(z.literal('')),
})

export type CreateUserFormInput = z.infer<typeof createSuperAdminSchema>
