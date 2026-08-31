/** Zod — عقد إنشاء كشف تأديبي */
import { z } from 'zod'
import { CONTRACTOR_TYPES } from '../types'

export const disclosureSchema = z.object({
  db_number: z.string().min(1, 'رقم الآلية (DB) مطلوب').max(30),
  driver_name: z.string().min(2, 'اسم السائق مطلوب (حرفان فأكثر)').max(80),
  vehicle_type: z.string().max(50).optional().or(z.literal('')),
  contractor_name: z
    .enum(CONTRACTOR_TYPES, { message: 'اختر نوع المتعهد' })
    .optional()
    .or(z.literal('')),
  sector: z.string().max(60).optional().or(z.literal('')),
  shift: z.enum(['morning', 'evening', 'night'], { message: 'اختر الشفت' }),
  log_date: z.string().min(1, 'التاريخ مطلوب'),
  violation_type: z.enum(
    ['delay', 'absence', 'collection', 'evasion', 'early_withdrawal', 'load_deficiency'],
    { message: 'اختر نوع المخالفة' },
  ),
  // «توبيخ» أُلغي من الاختيارات (ميجريشن 00041)
  penalty_type: z.enum(['warning', 'termination']).optional().or(z.literal('')),
  details: z.string().min(10, 'تفاصيل الكشف مطلوبة (10 أحرف فأكثر)').max(2000),
  prepared_by_name: z.string().max(80).optional().or(z.literal('')),
})

export type DisclosureFormInput = z.infer<typeof disclosureSchema>

export const archiveReasonSchema = z.object({
  reason: z.string().min(5, 'اذكر سبب الحذف بوضوح (5 أحرف فأكثر)').max(500),
})
export type ArchiveReasonInput = z.infer<typeof archiveReasonSchema>
