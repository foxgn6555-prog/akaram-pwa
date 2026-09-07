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
    'field_ops', 'admin_ops', 'maintenance',
    'transfer_station', 'executive_director', 'deputy_director', 'ops_room',
    'disclosures_officer', 'complaints_officer',
  ], { message: 'اختر دوراً للمستخدم' }),
  /** ربط سجل موظف — اختياري لكنه المعتاد في الشركة */
  employee_number: z
    .string()
    .regex(/^[A-Za-z0-9-]*$/, 'الرقم الوظيفي: حروف إنجليزية وأرقام وشرطات فقط')
    .optional()
    .or(z.literal('')),
  department_id: z.string().uuid('اختر القسم').optional().or(z.literal('')),
  job_title: z.string().max(100, 'المسمى طويل جداً').optional().or(z.literal('')),
  /** إسناد مسؤول القسم: الشفت (مطلوب فقط عندما الدور = department_manager) */
  manager_shift: z.enum(['morning', 'evening', 'night']).optional(),
  /** مناطق العمل المسندة (1–8) ضمن قاطعي الكرادة والزعفرانية */
  manager_sectors: z.array(z.number().int().min(1).max(8)).max(8).optional(),
})
  // تحقق شرطي: مسؤول القسم يلزمه شفت + منطقة واحدة على الأقل
  .superRefine((val, ctx) => {
    if (val.role !== 'department_manager') return
    if (!val.manager_shift) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['manager_shift'], message: 'اختر شفت مسؤول القسم' })
    }
    const n = val.manager_sectors?.length ?? 0
    if (n < 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['manager_sectors'], message: 'اختر منطقة واحدة على الأقل' })
    } else if (n > 8) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['manager_sectors'], message: 'لا يمكن تجاوز المناطق الثماني' })
    }
  })

export type CreateUserFormInput = z.infer<typeof createSuperAdminSchema>

/**
 * Zod — عقد تعديل بيانات الموظف المرتبط بمستخدم
 * (التحقق المزدوج: هنا + دالة set_employee_profile على الخادم)
 */
export const updateProfileSchema = z.object({
  full_name: z.string().min(3, 'الاسم الكامل مطلوب (3 أحرف فأكثر)'),
  phone: z
    .string()
    .regex(/^[0-9+\-\s]*$/, 'الهاتف: أرقام و + و - فقط')
    .max(20, 'رقم الهاتف طويل جداً')
    .optional()
    .or(z.literal('')),
  job_title: z.string().max(100, 'المسمى طويل جداً').optional().or(z.literal('')),
  department_id: z.string().uuid('اختر القسم').optional().or(z.literal('')),
  employee_number: z
    .string()
    .regex(/^[A-Za-z0-9-]*$/, 'الرقم الوظيفي: حروف إنجليزية وأرقام وشرطات فقط')
    .optional()
    .or(z.literal('')),
})

export type UpdateProfileFormInput = z.infer<typeof updateProfileSchema>
