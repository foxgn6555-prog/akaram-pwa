/** Zod — عقود إنشاء/تعديل موظف */
import { z } from 'zod'

export const employeeSchema = z.object({
  employee_number: z
    .string()
    .min(1, 'الرقم الوظيفي مطلوب')
    .regex(/^[A-Za-z0-9-]+$/, 'الرقم الوظيفي: حروف إنجليزية وأرقام وشرطات فقط'),
  full_name: z.string().min(3, 'الاسم الكامل مطلوب (3 أحرف فأكثر)'),
  email: z.string().email('صيغة البريد غير صحيحة').optional().or(z.literal('')),
  phone: z
    .string()
    .regex(/^07\d{9}$/, 'رقم الهاتف العراقي: 07XXXXXXXXX')
    .optional()
    .or(z.literal('')),
  department_id: z.string().uuid('اختر القسم').optional().or(z.literal('')),
  job_title: z.string().min(2).optional().or(z.literal('')),
})

export type EmployeeFormInput = z.infer<typeof employeeSchema>
